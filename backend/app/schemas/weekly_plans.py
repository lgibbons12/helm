"""Weekly plan schemas."""

from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class WeeklyPlanRead(BaseSchema):
    """Schema for reading a weekly plan."""

    id: UUID
    user_id: UUID
    week_start: date
    content: str | None = None
    created_at: datetime
    updated_at: datetime


class WeeklyPlanUpsert(BaseSchema):
    """Schema for creating or updating a weekly plan.

    Uses upsert semantics: if a plan for the given week_start exists,
    it will be updated; otherwise a new one is created.
    """

    week_start: date
    content: str | None = None
