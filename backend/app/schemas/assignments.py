"""Assignment schemas."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema

# Type aliases for enums (used as literals for API validation)
AssignmentStatusType = Literal["not_started", "in_progress", "done"]
AssignmentTypeType = Literal["pset", "reading", "project", "quiz", "other"]
DayOfWeekType = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


class AssignmentBase(BaseSchema):
    """Base assignment schema."""

    title: str = Field(..., min_length=1, max_length=255)
    type: AssignmentTypeType = "other"
    due_date: date | None = None
    planned_start_day: DayOfWeekType | None = None
    estimated_minutes: int | None = Field(None, gt=0)
    status: AssignmentStatusType = "not_started"
    notes_short: str | None = None


class AssignmentCreate(AssignmentBase):
    """Schema for creating an assignment."""

    class_id: UUID | None = None


class AssignmentRead(AssignmentBase):
    """Schema for reading assignment data."""

    id: UUID
    user_id: UUID
    class_id: UUID | None
    created_at: datetime
    updated_at: datetime


class AssignmentUpdate(BaseSchema):
    """Schema for updating an assignment. All fields optional."""

    title: str | None = Field(None, min_length=1, max_length=255)
    type: AssignmentTypeType | None = None
    class_id: UUID | None = None
    due_date: date | None = None
    planned_start_day: DayOfWeekType | None = None
    estimated_minutes: int | None = Field(None, gt=0)
    status: AssignmentStatusType | None = None
    notes_short: str | None = None
