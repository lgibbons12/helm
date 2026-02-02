"""Time block CRUD routes."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import TimeBlock
from app.schemas.time_blocks import TimeBlockCreate, TimeBlockRead, TimeBlockUpdate

router = APIRouter(prefix="/time-blocks", tags=["time-blocks"])


@router.get("/", response_model=list[TimeBlockRead])
async def list_time_blocks(
    current_user: CurrentUser,
    db: DbSession,
    start_after: datetime | None = None,
    start_before: datetime | None = None,
    kind: str | None = None,
) -> list[TimeBlockRead]:
    """
    List time blocks for the current user.
    
    Filters:
    - start_after/start_before: Filter by start_datetime range
    - kind: Filter by kind (assignment, meeting, class, personal)
    """
    query = select(TimeBlock).where(TimeBlock.user_id == current_user.id)
    
    if start_after:
        query = query.where(TimeBlock.start_datetime >= start_after)
    if start_before:
        query = query.where(TimeBlock.start_datetime <= start_before)
    if kind:
        query = query.where(TimeBlock.kind == kind)
    
    query = query.order_by(TimeBlock.start_datetime.asc())
    
    result = await db.execute(query)
    return [TimeBlockRead.model_validate(tb) for tb in result.scalars()]


@router.post("/", response_model=TimeBlockRead, status_code=status.HTTP_201_CREATED)
async def create_time_block(
    data: TimeBlockCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> TimeBlockRead:
    """Create a new time block."""
    new_block = TimeBlock(
        user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(new_block)
    await db.commit()
    await db.refresh(new_block)
    return TimeBlockRead.model_validate(new_block)


@router.get("/{block_id}", response_model=TimeBlockRead)
async def get_time_block(
    block_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> TimeBlockRead:
    """Get a specific time block by ID."""
    block = await get_user_resource_or_404(db, TimeBlock, block_id, current_user.id)
    return TimeBlockRead.model_validate(block)


@router.patch("/{block_id}", response_model=TimeBlockRead)
async def update_time_block(
    block_id: UUID,
    data: TimeBlockUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> TimeBlockRead:
    """Update a time block."""
    block = await get_user_resource_or_404(db, TimeBlock, block_id, current_user.id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(block, key, value)
    await db.commit()
    await db.refresh(block)
    return TimeBlockRead.model_validate(block)


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_time_block(
    block_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a time block."""
    block = await get_user_resource_or_404(db, TimeBlock, block_id, current_user.id)
    await db.delete(block)
    await db.commit()
