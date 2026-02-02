"""Class/Course schemas."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import BaseSchema


class ClassBase(BaseSchema):
    """Base class schema with common fields."""

    name: str = Field(..., min_length=1, max_length=255)
    code: str | None = Field(None, max_length=50)
    semester: str = Field(..., min_length=1, max_length=50)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    instructor: str | None = Field(None, max_length=255)
    links_json: dict[str, Any] | None = Field(default_factory=dict)

    @field_validator("links_json", mode="before")
    @classmethod
    def ensure_dict(cls, v: Any) -> dict:
        """Ensure links_json is a dict."""
        if v is None:
            return {}
        return v


class ClassCreate(ClassBase):
    """Schema for creating a class."""

    pass


class ClassRead(ClassBase):
    """Schema for reading class data."""

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class ClassUpdate(BaseSchema):
    """Schema for updating a class. All fields optional."""

    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, max_length=50)
    semester: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    instructor: str | None = Field(None, max_length=255)
    links_json: dict[str, Any] | None = None
