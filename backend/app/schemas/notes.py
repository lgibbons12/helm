"""Note schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class NoteBase(BaseSchema):
    """Base note schema."""

    title: str = Field(default="Untitled", min_length=1, max_length=255)
    content_text: str | None = None  # Markdown content (AI-readable)
    tags: list[str] = Field(default_factory=list)


class NoteCreate(NoteBase):
    """Schema for creating a note.
    
    Notes can be:
    - Standalone (both class_id and assignment_id are None)
    - Attached to a class (class_id is set)
    - Attached to an assignment (assignment_id is set)
    """

    class_id: UUID | None = None
    assignment_id: UUID | None = None


class NoteRead(NoteBase):
    """Schema for reading note data."""

    id: UUID
    user_id: UUID
    class_id: UUID | None
    assignment_id: UUID | None
    class_name: str | None = None
    assignment_title: str | None = None
    created_at: datetime
    updated_at: datetime


class NoteUpdate(BaseSchema):
    """Schema for updating a note. All fields optional."""

    title: str | None = Field(None, min_length=1, max_length=255)
    content_text: str | None = None
    tags: list[str] | None = None
