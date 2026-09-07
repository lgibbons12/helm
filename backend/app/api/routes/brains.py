"""Brain memory routes.

Brains started out as a chat concept and their read endpoints still live under
/chat. Plato writes and reads them too, and the odin page that used to own them
is going away, so this router owns them going forward -- including the update
endpoint the class detail page needs to correct a wrong assessment by hand.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import BrainMemory, Class
from app.schemas.brains import BrainResponse, BrainUpdate
from app.services import brain_manager

router = APIRouter(prefix="/brains", tags=["brains"])

# Brain types addressable through this router.
_CLASS_SCOPED_TYPES = ("class", "quiz")


@router.get("/", response_model=list[BrainResponse])
async def list_brains(
    db: DbSession,
    user: CurrentUser,
) -> list[BrainResponse]:
    """List every brain for the current user (global, class, and quiz)."""
    stmt = select(BrainMemory).where(BrainMemory.user_id == user.id)
    result = await db.execute(stmt)
    return [BrainResponse.model_validate(brain) for brain in result.scalars()]


@router.get("/global", response_model=BrainResponse)
async def get_global_brain(
    db: DbSession,
    user: CurrentUser,
) -> BrainResponse:
    """Get the user-wide brain."""
    brain = await brain_manager.get_or_create_brain(db, user.id, None)
    return BrainResponse.model_validate(brain)


@router.get("/class/{class_id}", response_model=BrainResponse)
async def get_class_brain(
    class_id: UUID,
    db: DbSession,
    user: CurrentUser,
    brain_type: str = "class",
) -> BrainResponse:
    """
    Get a class-scoped brain.

    brain_type selects which one: 'class' is the conversational brain odin built
    up, 'quiz' is the Plato mastery record.
    """
    if brain_type not in _CLASS_SCOPED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"brain_type must be one of {', '.join(_CLASS_SCOPED_TYPES)}",
        )

    # Scopes the class to this user, so an unknown id cannot be probed.
    await get_user_resource_or_404(db, Class, class_id, user.id)

    brain = await brain_manager.get_or_create_brain(db, user.id, class_id, brain_type=brain_type)
    return BrainResponse.model_validate(brain)


@router.put("/{brain_id}", response_model=BrainResponse)
async def update_brain(
    brain_id: UUID,
    payload: BrainUpdate,
    db: DbSession,
    user: CurrentUser,
) -> BrainResponse:
    """
    Overwrite a brain's content by hand.

    The generated record drifts -- a concept lands in the wrong section, or you
    want to seed one before an exam. This is the escape hatch. It does not bump
    update_count, which counts model-driven rewrites.
    """
    brain = await get_user_resource_or_404(db, BrainMemory, brain_id, user.id)

    brain.content = payload.content
    await db.commit()
    await db.refresh(brain)

    return BrainResponse.model_validate(brain)
