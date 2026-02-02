"""Authentication schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class GoogleAuthRequest(BaseSchema):
    """Request schema for Google OAuth login."""

    id_token: str = Field(..., description="Google OAuth id_token from frontend")


class TokenResponse(BaseSchema):
    """Response schema for successful authentication."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Token expiry in seconds")


class AuthIdentityRead(BaseSchema):
    """Schema for reading auth identity (admin/debug use)."""

    id: UUID
    provider: str
    provider_user_id: str
    email: str | None
    created_at: datetime
    last_login_at: datetime
