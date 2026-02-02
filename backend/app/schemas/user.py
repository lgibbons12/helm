"""User schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import BaseSchema


class UserCreate(BaseSchema):
    """Schema for creating a user (internal use - users created via OAuth)."""

    email: EmailStr | None = None
    name: str = Field(..., min_length=1, max_length=255)


class UserRead(BaseSchema):
    """Schema for reading user data."""

    id: UUID
    email: str | None
    name: str
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseSchema):
    """Schema for updating user profile."""

    name: str | None = Field(None, min_length=1, max_length=255)
