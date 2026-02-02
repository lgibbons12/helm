"""Notes CRUD routes."""

from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import Note
from app.schemas.notes import NoteCreate, NoteRead, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/", response_model=list[NoteRead])
async def list_notes(
    current_user: CurrentUser,
    db: DbSession,
    class_id: UUID | None = None,
    tag: str | None = None,
) -> list[NoteRead]:
    """
    List notes for the current user.
    
    Filters:
    - class_id: Filter by class
    - tag: Filter by tag (notes containing this tag)
    """
    query = select(Note).where(Note.user_id == current_user.id)
    
    if class_id:
        query = query.where(Note.class_id == class_id)
    if tag:
        # Use PostgreSQL array containment operator
        query = query.where(Note.tags.contains([tag]))
    
    query = query.order_by(Note.updated_at.desc())
    
    result = await db.execute(query)
    return [NoteRead.model_validate(n) for n in result.scalars()]


@router.post("/", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    data: NoteCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteRead:
    """Create a new note."""
    new_note = Note(
        user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(new_note)
    await db.commit()
    await db.refresh(new_note)
    return NoteRead.model_validate(new_note)


@router.get("/{note_id}", response_model=NoteRead)
async def get_note(
    note_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteRead:
    """Get a specific note by ID."""
    note = await get_user_resource_or_404(db, Note, note_id, current_user.id)
    return NoteRead.model_validate(note)


@router.patch("/{note_id}", response_model=NoteRead)
async def update_note(
    note_id: UUID,
    data: NoteUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteRead:
    """Update a note."""
    note = await get_user_resource_or_404(db, Note, note_id, current_user.id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(note, key, value)
    await db.commit()
    await db.refresh(note)
    return NoteRead.model_validate(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a note."""
    note = await get_user_resource_or_404(db, Note, note_id, current_user.id)
    await db.delete(note)
    await db.commit()
