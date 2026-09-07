"""Plato quiz schemas.

Two views of a question exist. QuizQuestionStored is what lives in
quiz_sessions.questions and carries the answer; QuizQuestionRead is what the
client sees, with the answer fields removed. Routes must never serialize the
stored form directly.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema

QuizFormat = str  # 'multiple_choice' | 'free_recall' | 'flashcard'
QuizVerdictValue = str  # 'correct' | 'partial' | 'incorrect'


# =============================================================================
# SCOPE
# =============================================================================


class QuizScope(BaseSchema):
    """
    What a session should draw on.

    Recency is anchored to Note.updated_at, so "the last few classes" means the
    notes you most recently touched. An empty class_ids means every class --
    the cross-class review at the top of the page.
    """

    class_ids: list[UUID] = Field(default_factory=list)
    # Take this many notes, most recently updated first.
    note_limit: int | None = Field(default=None, ge=1, le=50)
    # Only consider notes updated within this many days.
    since_days: int | None = Field(default=None, ge=1, le=365)
    # Explicit selection. Set by the setup screen after you deselect a note that
    # recency pulled in by mistake; overrides note_limit and since_days.
    note_ids: list[UUID] | None = None


class QuizSessionCreate(QuizScope):
    """Request to generate and start a session."""

    question_count: int | None = Field(default=None, ge=3, le=25)


# =============================================================================
# SOURCE PREVIEW
# =============================================================================


class QuizSourceNote(BaseSchema):
    """One note that would feed generation."""

    id: UUID
    title: str
    class_id: UUID | None = None
    class_name: str | None = None
    updated_at: datetime
    char_count: int


class QuizSourcePreview(BaseSchema):
    """
    What a given scope resolves to, shown before you commit to generating.

    Note recency is not lecture recency -- going back to tidy an old note
    promotes it. Listing the notes with their dates is how you catch that.
    """

    notes: list[QuizSourceNote]
    pdf_count: int
    assignment_count: int
    exam_count: int
    total_source_chars: int
    # False when there is too little material to produce real questions.
    sufficient: bool
    message: str | None = None


# =============================================================================
# QUESTIONS
# =============================================================================


class QuizQuestionRead(BaseSchema):
    """A question as the client sees it. No answer fields."""

    id: str
    format: QuizFormat
    prompt: str
    # Present for multiple choice only.
    choices: list[str] | None = None
    concept: str
    class_id: UUID | None = None
    source_note_id: UUID | None = None


class QuizQuestionStored(QuizQuestionRead):
    """A question as persisted, including how to grade it."""

    correct_choice_index: int | None = None
    model_answer: str

    def to_read(self) -> QuizQuestionRead:
        """Strip the answer fields for transport to the client."""
        return QuizQuestionRead(
            id=self.id,
            format=self.format,
            prompt=self.prompt,
            choices=self.choices,
            concept=self.concept,
            class_id=self.class_id,
            source_note_id=self.source_note_id,
        )


# =============================================================================
# ANSWERS
# =============================================================================


class QuizAnswerSubmit(BaseSchema):
    """An answer to one question."""

    question_id: str
    # Multiple choice: the index picked. Free recall: the text written.
    # Flashcard: omit both and set self_grade.
    choice_index: int | None = None
    text: str | None = None
    # Flashcards are self-graded, and free recall accepts an override when you
    # disagree with the model's call. Your correction is what feeds the brain.
    self_grade: QuizVerdictValue | None = None

    @model_validator(mode="after")
    def _require_a_response(self) -> "QuizAnswerSubmit":
        if self.choice_index is None and not self.text and self.self_grade is None:
            raise ValueError(
                "Provide choice_index, text, or self_grade for this answer"
            )
        return self


class QuizAnswerResult(BaseSchema):
    """How one answer was graded."""

    question_id: str
    verdict: QuizVerdictValue
    explanation: str
    # What the answer should have been, revealed once the question is answered.
    model_answer: str
    correct_choice_index: int | None = None
    # True when the verdict came from a manual override rather than the model.
    self_graded: bool = False


# =============================================================================
# SESSIONS
# =============================================================================


class QuizSessionRead(BaseSchema):
    """A session and its progress."""

    id: UUID
    class_ids: list[UUID]
    source_note_ids: list[UUID]
    status: str
    questions: list[QuizQuestionRead]
    responses: list[QuizAnswerResult]
    created_at: datetime
    completed_at: datetime | None = None


class QuizConceptScore(BaseSchema):
    """Per-concept tally on the results screen."""

    concept: str
    correct: int
    total: int


class QuizSessionSummary(BaseSchema):
    """Results of a completed session."""

    session_id: UUID
    total: int
    correct: int
    partial: int
    incorrect: int
    concepts: list[QuizConceptScore]
    # Brains are rewritten in the background, so this reports what was queued
    # rather than what has already landed.
    brain_update_queued: bool


def stored_questions(raw: list[dict[str, Any]]) -> list[QuizQuestionStored]:
    """Parse the JSONB question list off a session row."""
    return [QuizQuestionStored.model_validate(item) for item in raw]
