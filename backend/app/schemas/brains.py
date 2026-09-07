"""Brain memory schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class BrainResponse(BaseSchema):
    """A brain memory as returned to the client."""

    id: UUID
    content: str
    update_count: int
    brain_type: str
    class_id: UUID | None = None
    updated_at: datetime


class BrainUpdate(BaseSchema):
    """Hand-edited brain content."""

    content: str = Field(max_length=20000)
