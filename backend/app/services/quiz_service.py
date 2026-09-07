"""Plato quiz generation and grading.

Context here is assembled notes-first, deliberately not by reusing
chat_service.build_context(). That builder adds PDFs before notes against a
shared budget, so a class with several large slide decks can exhaust the budget
before a single note is read -- the wrong way round for a feature whose premise
is your own notes.
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from anthropic import AsyncAnthropic
from anthropic.types import ToolChoiceToolParam, ToolParam
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db.models import PDF, Assignment, Class, Exam, Note
from app.schemas.quiz import (
    QuizAnswerResult,
    QuizConceptScore,
    QuizQuestionStored,
    QuizScope,
    QuizSourceNote,
    QuizSourcePreview,
)
from app.services.brain_manager import _retry_anthropic, brain_manager

logger = logging.getLogger(__name__)
settings = get_settings()

# Default when a scope names no explicit note selection or window.
_DEFAULT_NOTE_LIMIT = 10
# PDFs are supporting material, not the point. Cap how many can crowd in.
_MAX_PDFS = 5

_FORMATS = ("multiple_choice", "free_recall", "flashcard")


# =============================================================================
# SOURCE RESOLUTION
# =============================================================================


@dataclass
class ResolvedSources:
    """Everything a session will be generated from."""

    notes: list[Note] = field(default_factory=list)
    pdfs: list[PDF] = field(default_factory=list)
    assignments: list[Assignment] = field(default_factory=list)
    exams: list[Exam] = field(default_factory=list)
    classes: dict[UUID, Class] = field(default_factory=dict)

    @property
    def note_chars(self) -> int:
        """Total characters of note content, which drives the sufficiency check."""
        return sum(len(n.content_text or "") for n in self.notes)

    @property
    def class_ids(self) -> list[UUID]:
        return list(self.classes.keys())


async def resolve_sources(
    db: Any,
    user_id: UUID,
    scope: QuizScope,
) -> ResolvedSources:
    """
    Turn a scope into concrete rows.

    Notes are ordered by updated_at descending -- the recency anchor. An empty
    scope.class_ids means every class, which is what the cross-class review
    uses; recency then naturally favours whatever you are actually working on.
    """
    note_query = (
        select(Note)
        .where(Note.user_id == user_id)
        .options(selectinload(Note.class_))
        .order_by(Note.updated_at.desc())
    )

    if scope.note_ids is not None:
        # Explicit selection wins over every other filter.
        note_query = note_query.where(Note.id.in_(scope.note_ids))
    else:
        if scope.class_ids:
            note_query = note_query.where(Note.class_id.in_(scope.class_ids))
        if scope.since_days is not None:
            cutoff = datetime.now(timezone.utc) - timedelta(days=scope.since_days)
            note_query = note_query.where(Note.updated_at >= cutoff)
        limit = scope.note_limit or _DEFAULT_NOTE_LIMIT
        note_query = note_query.limit(limit)

    notes = list((await db.execute(note_query)).scalars())
    # Only notes with actual content can produce questions.
    notes = [n for n in notes if (n.content_text or "").strip()]

    # Classes come from the notes we landed on, plus anything explicitly scoped.
    class_ids = {n.class_id for n in notes if n.class_id}
    class_ids.update(scope.class_ids)

    classes: dict[UUID, Class] = {}
    if class_ids:
        rows = await db.execute(
            select(Class).where(Class.id.in_(class_ids), Class.user_id == user_id)
        )
        classes = {c.id: c for c in rows.scalars()}

    pdfs: list[PDF] = []
    assignments: list[Assignment] = []
    exams: list[Exam] = []

    if classes:
        scoped = list(classes.keys())

        pdf_rows = await db.execute(
            select(PDF)
            .where(
                PDF.user_id == user_id,
                PDF.class_id.in_(scoped),
                PDF.extraction_status == "success",
            )
            .order_by(PDF.created_at.desc())
            .limit(_MAX_PDFS)
        )
        pdfs = list(pdf_rows.scalars())

        assignment_rows = await db.execute(
            select(Assignment)
            .where(Assignment.user_id == user_id, Assignment.class_id.in_(scoped))
            .order_by(Assignment.due_date.desc().nullslast())
            .limit(20)
        )
        assignments = list(assignment_rows.scalars())

        exam_rows = await db.execute(
            select(Exam)
            .where(Exam.user_id == user_id, Exam.class_id.in_(scoped))
            .order_by(Exam.exam_datetime.desc().nullslast())
            .limit(10)
        )
        exams = list(exam_rows.scalars())

    return ResolvedSources(
        notes=notes, pdfs=pdfs, assignments=assignments, exams=exams, classes=classes
    )


def build_preview(resolved: ResolvedSources) -> QuizSourcePreview:
    """Describe a resolved scope, including whether it is worth generating from."""
    notes = [
        QuizSourceNote(
            id=n.id,
            title=n.title,
            class_id=n.class_id,
            class_name=n.class_.name if n.class_ else None,
            updated_at=n.updated_at,
            char_count=len(n.content_text or ""),
        )
        for n in resolved.notes
    ]

    total = resolved.note_chars
    sufficient = total >= settings.quiz_min_source_chars
    message = None
    if not resolved.notes:
        message = "no notes with content in this range. write some notes first."
    elif not sufficient:
        message = (
            f"only {total} characters of notes here, and plato needs about "
            f"{settings.quiz_min_source_chars} to write questions worth "
            f"answering. widen the range or pick another class."
        )

    return QuizSourcePreview(
        notes=notes,
        pdf_count=len(resolved.pdfs),
        assignment_count=len(resolved.assignments),
        exam_count=len(resolved.exams),
        total_source_chars=total,
        sufficient=sufficient,
        message=message,
    )


# =============================================================================
# CONTEXT
# =============================================================================


async def build_context(
    db: Any,
    user_id: UUID,
    resolved: ResolvedSources,
) -> tuple[str, list[UUID]]:
    """
    Assemble the generation context, notes first.

    Returns the context string and the ordered note ids it references, so a
    question citing "note 3" can be mapped back to a real row.

    Order is deliberate: brains (small, and they steer everything), then notes
    (the point), then assignments and exams (what is actually being assessed),
    then PDFs with whatever budget is left.
    """
    parts: list[str] = []
    used = 0
    budget = settings.quiz_max_total_context_chars

    def add(part: str) -> bool:
        nonlocal used
        if used + len(part) > budget:
            return False
        parts.append(part)
        used += len(part)
        return True

    # 1. Brains, tagged as guidance rather than material. Notes and brains are
    #    both free markdown, and without the distinction the model cheerfully
    #    writes questions about whatever a brain happens to mention.
    for class_id, class_obj in resolved.classes.items():
        label = class_obj.name
        if class_obj.code:
            label += f" ({class_obj.code})"

        quiz_brain = await brain_manager.get_or_create_brain(
            db, user_id, class_id, brain_type="quiz"
        )
        if quiz_brain.content.strip():
            add(
                f'<mastery_record class="{label}">\n'
                f"{quiz_brain.content}\n</mastery_record>\n"
            )

        class_brain = await brain_manager.get_or_create_brain(db, user_id, class_id)
        if class_brain.content.strip():
            add(f'<background class="{label}">\n{class_brain.content}\n</background>\n')

    # 2. Notes, numbered so generated questions can cite their source.
    note_ids: list[UUID] = []
    for index, note in enumerate(resolved.notes, start=1):
        text = note.content_text or ""
        if len(text) > settings.note_context_max_chars:
            text = text[: settings.note_context_max_chars] + "\n[... truncated ...]"

        note_class = resolved.classes.get(note.class_id) if note.class_id else None
        attrs = f'number="{index}" title="{note.title}"'
        if note_class:
            attrs += f' class="{note_class.name}"'
        attrs += f' updated="{note.updated_at:%Y-%m-%d}"'

        if not add(f"<note {attrs}>\n{text}\n</note>\n"):
            logger.info(
                "Quiz context budget reached after %d of %d notes",
                index - 1, len(resolved.notes),
            )
            break
        note_ids.append(note.id)

    # 3. Assignments and exams -- what the material is actually assessed on.
    if resolved.assignments or resolved.exams:
        lines = ["<coursework>"]
        for a in resolved.assignments:
            lines.append(f"- {a.title} ({a.type}, due {a.due_date or 'unscheduled'})")
        for e in resolved.exams:
            when = (
                e.exam_datetime.strftime("%Y-%m-%d")
                if e.exam_datetime
                else "unscheduled"
            )
            lines.append(f"- EXAM: {e.title} ({when})")
        lines.append("</coursework>")
        add("\n".join(lines) + "\n")

    # 4. PDFs last, on whatever budget remains.
    for pdf in resolved.pdfs:
        if not pdf.extracted_text:
            continue
        text = pdf.extracted_text[: settings.pdf_context_max_chars]
        if len(pdf.extracted_text) > settings.pdf_context_max_chars:
            text += "\n[... truncated ...]"
        if not add(f'<document filename="{pdf.filename}">\n{text}\n</document>\n'):
            break

    return "\n\n".join(parts), note_ids


# =============================================================================
# GENERATION
# =============================================================================


def question_mix(count: int) -> dict[str, int]:
    """
    Split a session across the three formats.

    Roughly half multiple choice, a third free recall, the rest flashcards.
    Free recall costs an API call per answer, so it stays the minority.
    """
    multiple_choice = round(count * 0.5)
    free_recall = round(count * 0.3)
    flashcard = count - multiple_choice - free_recall
    if flashcard < 0:
        multiple_choice += flashcard
        flashcard = 0
    return {
        "multiple_choice": multiple_choice,
        "free_recall": free_recall,
        "flashcard": flashcard,
    }


_GENERATION_TOOL: ToolParam = {
    "name": "emit_questions",
    "description": "Return the generated quiz questions.",
    "input_schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "enum": list(_FORMATS),
                        },
                        "prompt": {
                            "type": "string",
                            "description": (
                                "The question. For a flashcard, the term or "
                                "prompt side of the card."
                            ),
                        },
                        "choices": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "Exactly four options. Multiple choice only."
                            ),
                        },
                        "correct_choice_index": {
                            "type": "integer",
                            "description": (
                                "Zero-based index of the correct option. "
                                "Multiple choice only."
                            ),
                        },
                        "model_answer": {
                            "type": "string",
                            "description": (
                                "The full correct answer. For a flashcard, the "
                                "back of the card. Used to grade free recall."
                            ),
                        },
                        "concept": {
                            "type": "string",
                            "description": (
                                "Short lowercase name of the concept tested, "
                                "used to track mastery over time."
                            ),
                        },
                        "source_note": {
                            "type": "integer",
                            "description": (
                                "The 'number' attribute of the <note> block this "
                                "question was drawn from. Omit only when the "
                                "question came from a <document>."
                            ),
                        },
                    },
                    "required": ["format", "prompt", "model_answer", "concept"],
                },
            }
        },
        "required": ["questions"],
    },
}


# Force the tool call rather than allowing prose, so a response is either
# structured or an outright failure -- never something to parse hopefully.
_FORCE_EMIT: ToolChoiceToolParam = {"type": "tool", "name": "emit_questions"}


class QuizService:
    """Generates and grades Plato sessions."""

    def __init__(self) -> None:
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    @property
    def model(self) -> str:
        return settings.quiz_model or settings.llm_model

    async def generate_questions(
        self,
        context: str,
        note_ids: list[UUID],
        class_ids: list[UUID],
        count: int,
        note_class_ids: dict[UUID, UUID | None] | None = None,
    ) -> list[QuizQuestionStored]:
        """
        Generate a mixed question set in one call.

        Uses tool-use rather than asking for JSON in prose, so the response is
        structured by construction instead of parsed hopefully.
        """
        mix = question_mix(count)

        system_prompt = f"""You write review questions for a student from their own \
course material.

Produce exactly {count} questions: {mix['multiple_choice']} multiple_choice, \
{mix['free_recall']} free_recall, and {mix['flashcard']} flashcard.

The context is tagged. The tags are not interchangeable:
- <note> and <document> are THE MATERIAL. Every question must come from these.
- <mastery_record> is what the student is currently strong and weak at. Use it
  to decide which parts of the material to weight toward. It is NOT material --
  never write a question about something that appears only here.
- <background> is accumulated context about the class. Same rule: it steers
  tone and depth, and is never itself the subject of a question.
- <coursework> lists what is being assessed and when. Weight toward topics with
  an exam or assignment coming up. Also not material.

Rules:
- Every question must be answerable from the <note> and <document> blocks alone.
  If the material is thin, ask fewer but better questions rather than reaching
  outside it.
- Set source_note to the number attribute of the <note> the question came from.
  Omit it only for a question drawn from a <document>.
- Test understanding, not trivia. A good question makes the student retrieve an
  idea, not recognise a word.
- Spread questions across the notes provided rather than mining one heavily.
- multiple_choice needs exactly four plausible options and a
  correct_choice_index. Wrong options should be wrong for a reason, not filler.
- Every question needs a model_answer, including multiple_choice, where it
  states the correct option and why it is correct.
- flashcard is a term or short prompt on the front, its definition in
  model_answer.
- Write prompts in lowercase, matching the app's voice. Keep concept names short.

{context}"""

        message = await _retry_anthropic(
            lambda: self.client.messages.create(
                model=self.model,
                max_tokens=settings.quiz_generation_max_tokens,
                system=system_prompt,
                tools=[_GENERATION_TOOL],
                tool_choice=_FORCE_EMIT,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Generate the questions from the material above."
                        ),
                    }
                ],
            )
        )

        raw = _extract_tool_input(message, "emit_questions")
        return _build_questions(
            raw.get("questions", []), note_ids, class_ids, note_class_ids or {}
        )

    async def grade_free_recall(
        self,
        question: QuizQuestionStored,
        answer: str,
    ) -> tuple[str, str]:
        """
        Grade one written answer against the model answer.

        Returns (verdict, explanation). Falls back to a neutral partial rather
        than raising -- a grading outage should not strand you mid-session with
        no way forward.
        """
        system_prompt = """You grade a student's recall answer against a model \
answer.

Judge the substance, not the wording. A student who has the right idea in their
own words is correct. A student who has part of it, or has it with a real error,
is partial. Do not reward keyword matching, and do not punish informality.

Be specific in the explanation: name what they got and what they missed. Write
in lowercase, addressed to them directly."""

        user_content = (
            f"question:\n{question.prompt}\n\n"
            f"model answer:\n{question.model_answer}\n\n"
            f"student answer:\n{answer}"
        )

        try:
            message = await _retry_anthropic(
                lambda: self.client.messages.create(
                    model=self.model,
                    max_tokens=settings.quiz_grading_max_tokens,
                    system=system_prompt,
                    tools=[_GRADING_TOOL],
                    tool_choice=_FORCE_GRADE,
                    messages=[{"role": "user", "content": user_content}],
                )
            )
            result = _extract_tool_input(message, "grade_answer")
            verdict = result.get("verdict")
            if verdict not in ("correct", "partial", "incorrect"):
                raise ValueError(f"bad verdict {verdict!r}")
            explanation = (result.get("explanation") or "").strip()
            return verdict, explanation

        except Exception:
            logger.exception("Grading failed for question %s", question.id)
            return (
                "partial",
                "grading is unavailable right now, so this one is left "
                "unscored. compare your answer against the one shown.",
            )


_GRADING_TOOL: ToolParam = {
    "name": "grade_answer",
    "description": "Return the grade for the student's answer.",
    "input_schema": {
        "type": "object",
        "properties": {
            "verdict": {
                "type": "string",
                "enum": ["correct", "partial", "incorrect"],
                "description": (
                    "correct: the substance is right, wording aside. "
                    "partial: some of the idea, with a real gap or error. "
                    "incorrect: the idea is missing or wrong."
                ),
            },
            "explanation": {
                "type": "string",
                "description": (
                    "Two or three sentences addressed to the student, saying "
                    "what they got and what they missed. Lowercase."
                ),
            },
        },
        "required": ["verdict", "explanation"],
    },
}

_FORCE_GRADE: ToolChoiceToolParam = {"type": "tool", "name": "grade_answer"}


def _extract_tool_input(message: Any, tool_name: str) -> dict[str, Any]:
    """Pull the tool-use payload out of a response, or raise if it is missing."""
    for block in message.content:
        if getattr(block, "type", None) == "tool_use" and block.name == tool_name:
            payload = block.input
            if isinstance(payload, str):
                payload = json.loads(payload)
            return dict(payload)
    raise ValueError(f"Model did not call {tool_name}")


def _build_questions(
    raw_questions: list[dict[str, Any]],
    note_ids: list[UUID],
    class_ids: list[UUID],
    note_class_ids: dict[UUID, UUID | None],
) -> list[QuizQuestionStored]:
    """Validate and normalize generated questions into stored form."""
    built: list[QuizQuestionStored] = []

    for raw in raw_questions:
        fmt = raw.get("format")
        if fmt not in _FORMATS:
            logger.warning("Discarding question with unknown format %r", fmt)
            continue

        prompt = (raw.get("prompt") or "").strip()
        if not prompt:
            logger.warning("Discarding question with no prompt")
            continue

        model_answer = (raw.get("model_answer") or "").strip()
        choices = raw.get("choices")
        correct_index = raw.get("correct_choice_index")

        if fmt == "multiple_choice":
            # A multiple choice question without usable options is unanswerable,
            # so drop it rather than rendering an empty list.
            if not isinstance(choices, list) or len(choices) < 2:
                logger.warning("Discarding multiple choice question without choices")
                continue
            if not isinstance(correct_index, int) or not (
                0 <= correct_index < len(choices)
            ):
                logger.warning(
                    "Discarding multiple choice question with bad answer index"
                )
                continue
            # The answer is already fully determined by the index, so a missing
            # model_answer is recoverable -- no reason to throw the question away.
            if not model_answer:
                model_answer = choices[correct_index]
        else:
            choices = None
            correct_index = None
            if not model_answer:
                logger.warning("Discarding %s question with no answer", fmt)
                continue

        # Map the model's note number back to a real id.
        source_note_id = None
        source_ref = raw.get("source_note")
        if isinstance(source_ref, int) and 1 <= source_ref <= len(note_ids):
            source_note_id = note_ids[source_ref - 1]

        # Attribute the question to a class via its source note, so a
        # cross-class session can still route results to the right brain.
        # Falling back to the only class in scope covers questions drawn from a
        # document, which carry no note reference.
        class_id = note_class_ids.get(source_note_id) if source_note_id else None
        if class_id is None and len(class_ids) == 1:
            class_id = class_ids[0]

        built.append(
            QuizQuestionStored(
                id=str(uuid.uuid4()),
                format=fmt,
                prompt=prompt,
                choices=choices,
                correct_choice_index=correct_index,
                model_answer=model_answer,
                concept=(raw.get("concept") or "general").strip().lower(),
                class_id=class_id,
                source_note_id=source_note_id,
            )
        )

    return built


quiz_service = QuizService()


# =============================================================================
# SESSION SUMMARY
# =============================================================================


def score_session(
    questions: list[QuizQuestionStored],
    responses: list[QuizAnswerResult],
) -> tuple[dict[str, int], list[QuizConceptScore]]:
    """
    Tally a session overall and per concept.

    Only answered questions count. Walking away halfway should not read as a
    string of wrong answers in the mastery record.
    """
    by_id = {q.id: q for q in questions}
    tally = {"total": 0, "correct": 0, "partial": 0, "incorrect": 0}
    per_concept: dict[str, dict[str, int]] = {}

    for response in responses:
        question = by_id.get(response.question_id)
        if question is None:
            continue
        tally["total"] += 1
        tally[response.verdict] = tally.get(response.verdict, 0) + 1

        bucket = per_concept.setdefault(question.concept, {"correct": 0, "total": 0})
        bucket["total"] += 1
        # Partial credit counts as correct for the concept tally; the brain
        # prompt sees the finer detail in the transcript.
        if response.verdict == "correct":
            bucket["correct"] += 1

    concepts = [
        QuizConceptScore(concept=name, correct=v["correct"], total=v["total"])
        for name, v in sorted(per_concept.items())
    ]
    return tally, concepts


def build_session_summary(
    questions: list[QuizQuestionStored],
    responses: list[QuizAnswerResult],
    class_id: UUID | None = None,
) -> str:
    """
    Render a completed session as markdown for the brain update.

    Built here rather than by the model: the facts are already known, and
    spending a call to restate them would only add a chance to get them wrong.
    """
    if class_id is not None:
        questions = [q for q in questions if q.class_id == class_id]

    answered_ids = {q.id for q in questions}
    responses = [r for r in responses if r.question_id in answered_ids]

    tally, concepts = score_session(questions, responses)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    lines = [
        f"session on {today}: {tally['correct']} correct, "
        f"{tally['partial']} partial, {tally['incorrect']} incorrect "
        f"out of {tally['total']} answered",
        "",
    ]

    by_id = {q.id: q for q in questions}
    for response in responses:
        question = by_id.get(response.question_id)
        if question is None:
            continue
        marker = {"correct": "+", "partial": "~", "incorrect": "-"}[response.verdict]
        lines.append(f"{marker} [{question.concept}] {question.prompt}")
        if response.verdict != "correct":
            lines.append(f"    missed: {response.explanation}")

    if concepts:
        lines.append("")
        lines.append("per concept: " + ", ".join(
            f"{c.concept} {c.correct}/{c.total}" for c in concepts
        ))

    return "\n".join(lines)
