"""Exam schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class ExamBase(BaseSchema):
    """Base exam schema."""

    title: str = Field(..., min_length=1, max_length=255)
    exam_datetime: datetime | None = None
    location: str | None = Field(None, max_length=255)
    weight: float | None = Field(None, ge=0, le=100)
    notes: str | None = None


class ExamCreate(ExamBase):
    """Schema for creating an exam."""

    class_id: UUID | None = None


class ExamRead(ExamBase):
    """Schema for reading exam data."""

    id: UUID
    user_id: UUID
    class_id: UUID | None
    created_at: datetime
    updated_at: datetime


class ExamUpdate(BaseSchema):
    """Schema for updating an exam. All fields optional."""

    title: str | None = Field(None, min_length=1, max_length=255)
    class_id: UUID | None = None
    exam_datetime: datetime | None = None
    location: str | None = Field(None, max_length=255)
    weight: float | None = Field(None, ge=0, le=100)
    notes: str | None = None
