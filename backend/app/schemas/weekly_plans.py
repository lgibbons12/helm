"""Weekly plan schemas."""

from datetime import datetime
from uuid import UUID

from app.schemas.base import BaseSchema


class WeeklyPlanRead(BaseSchema):
    """Schema for reading a weekly plan."""

    id: UUID
    user_id: UUID
    content: str | None = None
    created_at: datetime
    updated_at: datetime


class WeeklyPlanUpsert(BaseSchema):
    """Schema for creating or updating a weekly plan."""

    content: str | None = None
