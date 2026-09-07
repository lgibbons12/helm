"""Plato quiz routes.

Sessions are generated fresh -- there is no cached question bank -- and held
server-side so model answers never reach the browser. Every response here
serializes questions through QuizQuestionStored.to_read(), which strips them.
"""

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.api.routes.notes import note_to_read
from app.config import get_settings, sanitize_error
from app.db.models import Note, QuizSession
from app.db.session import AsyncSessionLocal
from app.schemas.notes import NoteRead
from app.schemas.quiz import (
    QuizAnswerResult,
    QuizAnswerSubmit,
    QuizReveal,
    QuizRevealRequest,
    QuizScope,
    QuizSessionCreate,
    QuizSessionRead,
    QuizSessionSummary,
    QuizSourcePreview,
    stored_questions,
)
from app.services import brain_manager, quiz_service
from app.services.quiz_service import (
    build_context,
    build_preview,
    build_session_summary,
    resolve_sources,
    score_session,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/quiz", tags=["quiz"])


async def _update_quiz_brains_background(
    user_id: UUID,
    session_id: UUID,
) -> None:
    """
    Fold a finished session into the quiz brain of every class it touched.

    Opens its own session because the request that triggered it has already
    returned. Mirrors _update_brains_background in chat.py.
    """
    try:
        async with AsyncSessionLocal() as db:
            session = await db.get(QuizSession, session_id)
            if session is None or session.user_id != user_id:
                return

            questions = stored_questions(session.questions)
            responses = [QuizAnswerResult.model_validate(r) for r in session.responses]

            # A question with no class cannot be attributed to a brain.
            class_ids = {q.class_id for q in questions if q.class_id}
            for class_id in class_ids:
                summary = build_session_summary(questions, responses, class_id)
                if not summary.strip():
                    continue
                try:
                    brain = await brain_manager.get_or_create_brain(
                        db, user_id, class_id, brain_type="quiz"
                    )
                    await brain_manager.update_quiz_brain(db, brain, summary)
                except Exception:
                    logger.exception("Quiz brain update failed for class %s", class_id)
    except Exception:
        logger.exception("Background quiz brain update failed for %s", session_id)


def _to_read(session: QuizSession) -> QuizSessionRead:
    """Serialize a session with the answer fields removed from its questions."""
    return QuizSessionRead(
        id=session.id,
        class_ids=session.class_ids,
        source_note_ids=session.source_note_ids,
        status=session.status,
        questions=[q.to_read() for q in stored_questions(session.questions)],
        responses=session.responses,
        created_at=session.created_at,
        completed_at=session.completed_at,
    )


@router.post("/sources", response_model=QuizSourcePreview)
async def preview_sources(
    scope: QuizScope,
    db: DbSession,
    user: CurrentUser,
) -> QuizSourcePreview:
    """
    Show what a scope resolves to before committing to generating from it.

    A POST because the scope is a body, not because it changes anything.
    """
    resolved = await resolve_sources(db, user.id, scope)
    return build_preview(resolved)


@router.post(
    "/study-guide", response_model=NoteRead, status_code=status.HTTP_201_CREATED
)
async def create_study_guide(
    payload: QuizScope,
    db: DbSession,
    user: CurrentUser,
) -> NoteRead:
    """
    Write a study guide over a scope and save it as a note on the class.

    Saved as a Note rather than its own model so it lands in the tree, is
    searchable, is editable when it gets something wrong, and can itself be
    quizzed later.
    """
    resolved = await resolve_sources(db, user.id, payload)

    preview = build_preview(resolved)
    if not preview.sufficient:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=preview.message or "not enough material for a study guide",
        )

    # A guide belongs to one class -- it is a thing you sit down and read before
    # one exam. Spanning classes would produce something no one studies from.
    if len(resolved.classes) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "pick a single class for a study guide."
                if len(resolved.classes) > 1
                else "these notes aren't attached to a class."
            ),
        )

    class_id, class_obj = next(iter(resolved.classes.items()))
    context, _ = await build_context(db, user.id, resolved)

    try:
        content = await quiz_service.generate_study_guide(context, class_obj.name)
    except Exception as exc:
        logger.exception("Study guide generation failed for user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=sanitize_error(exc, generic_message="could not write the guide"),
        ) from exc

    today = datetime.now(timezone.utc)
    label = f"{today:%b} {today.day}"  # "sep 7", without platform-specific %-d
    note = Note(
        user_id=user.id,
        class_id=class_id,
        title=f"study guide: {class_obj.code or class_obj.name} ({label})".lower(),
        content_text=content,
        # Tagged so generated guides are filterable and never mistaken for
        # something you wrote yourself.
        tags=["plato", "study-guide"],
    )
    db.add(note)
    await db.commit()
    await db.refresh(note, ["class_", "assignment"])

    return note_to_read(note)


@router.post(
    "/sessions", response_model=QuizSessionRead, status_code=status.HTTP_201_CREATED
)
async def create_session(
    payload: QuizSessionCreate,
    db: DbSession,
    user: CurrentUser,
) -> QuizSessionRead:
    """Generate a mixed question set and open a session on it."""
    scope = QuizScope.model_validate(payload.model_dump(exclude={"question_count"}))
    resolved = await resolve_sources(db, user.id, scope)

    preview = build_preview(resolved)
    if not preview.sufficient:
        # Better to say why than to generate hollow questions from three bullets.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=preview.message or "not enough material to build a quiz",
        )

    context, note_ids = await build_context(db, user.id, resolved)
    count = payload.question_count or settings.quiz_default_question_count
    note_class_ids = {n.id: n.class_id for n in resolved.notes}

    try:
        questions = await quiz_service.generate_questions(
            context=context,
            note_ids=note_ids,
            class_ids=resolved.class_ids,
            count=count,
            note_class_ids=note_class_ids,
        )
    except Exception as exc:
        logger.exception("Quiz generation failed for user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=sanitize_error(exc, generic_message="could not generate questions"),
        ) from exc

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="no usable questions came back. try again or widen the range.",
        )

    session = QuizSession(
        user_id=user.id,
        class_ids=resolved.class_ids,
        source_note_ids=note_ids,
        status="in_progress",
        questions=[q.model_dump(mode="json") for q in questions],
        responses=[],
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return _to_read(session)


@router.get("/sessions/{session_id}", response_model=QuizSessionRead)
async def get_session(
    session_id: UUID,
    db: DbSession,
    user: CurrentUser,
) -> QuizSessionRead:
    """Resume a session. Progress survives a refresh because it lives here."""
    session = await get_user_resource_or_404(db, QuizSession, session_id, user.id)
    return _to_read(session)


@router.post("/sessions/{session_id}/answers", response_model=QuizAnswerResult)
async def submit_answer(
    session_id: UUID,
    payload: QuizAnswerSubmit,
    db: DbSession,
    user: CurrentUser,
) -> QuizAnswerResult:
    """
    Answer one question and get it graded immediately.

    Multiple choice and flashcards cost nothing -- the first is decided by the
    stored index, the second by your own call. Only free recall goes to the
    model, and even then a self_grade overrides it, because you are the one who
    knows whether you actually knew it.
    """
    session = await get_user_resource_or_404(db, QuizSession, session_id, user.id)

    if session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="this session is already finished",
        )

    questions = {q.id: q for q in stored_questions(session.questions)}
    question = questions.get(payload.question_id)
    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no such question in this session",
        )

    self_graded = False

    if payload.self_grade is not None:
        # Covers flashcards, and a disagreement with the model on free recall.
        verdict = payload.self_grade
        explanation = "graded by you."
        self_graded = True

    elif question.format == "multiple_choice":
        if payload.choice_index is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="pick an option",
            )
        correct = payload.choice_index == question.correct_choice_index
        verdict = "correct" if correct else "incorrect"
        explanation = question.model_answer

    elif question.format == "free_recall":
        if not payload.text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="write an answer first",
            )
        verdict, explanation = await quiz_service.grade_free_recall(
            question, payload.text
        )

    else:  # flashcard without a self_grade
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="mark the flashcard yourself",
        )

    result = QuizAnswerResult(
        question_id=question.id,
        verdict=verdict,
        explanation=explanation,
        model_answer=question.model_answer,
        correct_choice_index=question.correct_choice_index,
        self_graded=self_graded,
    )

    # Replace any earlier response for this question, so an override wins
    # rather than being recorded twice.
    responses = [r for r in session.responses if r.get("question_id") != question.id]
    responses.append(result.model_dump(mode="json"))
    session.responses = responses
    # JSONB reassignment is not always seen as dirty by the ORM.
    flag_modified(session, "responses")

    await db.commit()
    return result


@router.post("/sessions/{session_id}/reveal", response_model=QuizReveal)
async def reveal_answer(
    session_id: UUID,
    payload: QuizRevealRequest,
    db: DbSession,
    user: CurrentUser,
) -> QuizReveal:
    """
    Show the back of a flashcard.

    Flashcards are self-graded, which means you have to see the answer before
    you can mark yourself. Restricted to that format on purpose: for multiple
    choice and free recall, being able to ask for the answer first would defeat
    the point of holding answers server-side at all.
    """
    session = await get_user_resource_or_404(db, QuizSession, session_id, user.id)

    questions = {q.id: q for q in stored_questions(session.questions)}
    question = questions.get(payload.question_id)
    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no such question in this session",
        )

    if question.format != "flashcard":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="only flashcards can be revealed before answering",
        )

    return QuizReveal(question_id=question.id, model_answer=question.model_answer)


@router.post("/sessions/{session_id}/complete", response_model=QuizSessionSummary)
async def complete_session(
    session_id: UUID,
    db: DbSession,
    user: CurrentUser,
) -> QuizSessionSummary:
    """
    Finish a session and queue the brain update.

    The brain rewrite is a model call, so it runs in the background -- you get
    your results immediately and the mastery record catches up behind you.
    """
    session = await get_user_resource_or_404(db, QuizSession, session_id, user.id)

    questions = stored_questions(session.questions)
    responses = [QuizAnswerResult.model_validate(r) for r in session.responses]
    tally, concepts = score_session(questions, responses)

    already_complete = session.status == "completed"
    if not already_complete:
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        await db.commit()

    # Nothing answered means nothing worth writing to the brain.
    queue_update = bool(responses) and not already_complete
    if queue_update:
        asyncio.create_task(_update_quiz_brains_background(user.id, session.id))

    return QuizSessionSummary(
        session_id=session.id,
        total=tally["total"],
        correct=tally["correct"],
        partial=tally["partial"],
        incorrect=tally["incorrect"],
        concepts=concepts,
        brain_update_queued=queue_update,
    )
