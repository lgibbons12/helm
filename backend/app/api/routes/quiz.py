"""Plato quiz routes.

Sessions are generated fresh -- there is no cached question bank -- and held
server-side so model answers never reach the browser. Every response here
serializes questions through QuizQuestionStored.to_read(), which strips them.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.config import get_settings, sanitize_error
from app.db.models import QuizSession
from app.schemas.quiz import (
    QuizScope,
    QuizSessionCreate,
    QuizSessionRead,
    QuizSourcePreview,
    stored_questions,
)
from app.services import quiz_service
from app.services.quiz_service import build_context, build_preview, resolve_sources

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/quiz", tags=["quiz"])


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

    try:
        questions = await quiz_service.generate_questions(
            context=context,
            note_ids=note_ids,
            class_ids=resolved.class_ids,
            count=count,
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
