"""Time block schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema

TimeBlockKindType = Literal["assignment", "meeting", "class", "personal"]


class TimeBlockBase(BaseSchema):
    """Base time block schema."""

    start_datetime: datetime
    end_datetime: datetime
    kind: TimeBlockKindType = "personal"
    title_override: str | None = Field(None, max_length=255)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self) -> "TimeBlockBase":
        """Ensure end_datetime > start_datetime."""
        if self.end_datetime <= self.start_datetime:
            raise ValueError("end_datetime must be after start_datetime")
        return self


class TimeBlockCreate(TimeBlockBase):
    """Schema for creating a time block."""

    assignment_id: UUID | None = None


class TimeBlockRead(TimeBlockBase):
    """Schema for reading time block data."""

    id: UUID
    user_id: UUID
    assignment_id: UUID | None
    created_at: datetime
    updated_at: datetime


class TimeBlockUpdate(BaseSchema):
    """Schema for updating a time block. All fields optional."""

    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    kind: TimeBlockKindType | None = None
    assignment_id: UUID | None = None
    title_override: str | None = Field(None, max_length=255)
    notes: str | None = None
