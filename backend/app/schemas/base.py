"""Base schema configuration."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema with common configuration."""

    model_config = ConfigDict(
        from_attributes=True,  # Enable ORM mode
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class TimestampMixin(BaseModel):
    """Mixin for created_at/updated_at timestamps."""

    created_at: datetime
    updated_at: datetime


class IDMixin(BaseModel):
    """Mixin for UUID primary key."""

    id: UUID
