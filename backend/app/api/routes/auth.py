"""
Authentication Routes

Endpoints:
- POST /auth/google - Exchange Google id_token for session
- POST /auth/logout - Clear session
- GET /me - Get current user profile

Auth Flow:
1. Frontend performs Google OAuth flow (using @react-oauth/google or similar)
2. Frontend receives id_token from Google
3. Frontend POSTs id_token to /auth/google
4. Backend verifies id_token with Google's public keys
5. Backend upserts user + auth_identity
6. Backend returns JWT (in cookie and response body)

Security:
- id_token is verified using Google's public keys (fetched from google-auth library)
- We do NOT store Google access/refresh tokens (no need for Google API calls)
- JWT is HttpOnly cookie + response body (client chooses how to use)
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db.models import AuthIdentity, User
from app.db.session import get_db
from app.schemas.auth import GoogleAuthRequest, TokenResponse
from app.schemas.user import UserRead
from app.api.deps import create_access_token, CurrentUser

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/google", response_model=TokenResponse)
async def google_login(
    request: GoogleAuthRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """
    Exchange Google id_token for a session JWT.

    Flow:
    1. Verify id_token with Google's public keys
    2. Extract user info (sub, email, name)
    3. Find or create auth_identity by (provider='google', provider_user_id=sub)
    4. Find or create user, link to auth_identity
    5. Return JWT

    The id_token is verified cryptographically - we trust Google's signature.
    """
    try:
        # Verify the id_token with Google's public keys
        # This checks signature, expiry, and audience
        idinfo = google_id_token.verify_oauth2_token(
            request.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )

        # Extract claims
        provider_user_id = idinfo["sub"]  # Unique Google user ID
        email = idinfo.get("email")
        name = idinfo.get("name", email or "Unknown User")

        # Additional verification
        if idinfo.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
            raise ValueError("Invalid issuer")

        # Security: Only trust verified emails
        # Unverified emails could allow account hijacking
        if email and not idinfo.get("email_verified", False):
            email = None  # Don't use unverified email for account linking

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google id_token: {e}",
        )

    # Look up existing auth_identity (eagerly load user to avoid async lazy-load)
    result = await db.execute(
        select(AuthIdentity)
        .options(selectinload(AuthIdentity.user))
        .where(
            AuthIdentity.provider == "google",
            AuthIdentity.provider_user_id == provider_user_id,
        )
    )
    auth_identity = result.scalar_one_or_none()

    if auth_identity:
        # Existing user - update last login
        auth_identity.last_login_at = datetime.now(timezone.utc)
        if email:
            auth_identity.email = email  # Update in case email changed
        user = auth_identity.user
    else:
        # New user - check if email exists (link accounts)
        user = None
        if email:
            result = await db.execute(select(User).where(User.email == email.lower()))
            user = result.scalar_one_or_none()

        if user is None:
            # Create new user
            user = User(
                email=email.lower() if email else None,
                name=name,
            )
            db.add(user)
            await db.flush()  # Get user.id

        # Create auth_identity
        auth_identity = AuthIdentity(
            user_id=user.id,
            provider="google",
            provider_user_id=provider_user_id,
            email=email,
        )
        db.add(auth_identity)

    await db.commit()

    # Generate JWT
    access_token = create_access_token(user.id)
    expires_in = settings.jwt_expire_minutes * 60

    # Set HttpOnly cookie (recommended for web apps)
    # For cross-domain deployments (e.g., Vercel + Render), use samesite="none" + secure=True
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_cross_domain or settings.environment != "development",
        samesite="none" if settings.cookie_cross_domain else "lax",
        max_age=expires_in,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    """
    Clear the authentication session.

    Note: This only clears the cookie. If the client stored the JWT
    elsewhere, it remains valid until expiry. For immediate revocation,
    implement a token blocklist (Redis recommended).
    """
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=settings.cookie_cross_domain or settings.environment != "development",
        samesite="none" if settings.cookie_cross_domain else "lax",
    )


@router.get("/me", response_model=UserRead)
async def get_me(current_user: CurrentUser) -> UserRead:
    """
    Get the current authenticated user's profile.

    This endpoint is useful for:
    - Verifying authentication status
    - Fetching user info after page reload
    - Checking if session is still valid
    """
    return UserRead.model_validate(current_user)


# =============================================================================
# EXTENDING TO OTHER PROVIDERS
# =============================================================================
#
# To add GitHub OAuth:
# 1. Add github_client_id and github_client_secret to Settings
# 2. Create POST /auth/github endpoint
# 3. Verify GitHub access_token by calling GitHub API
# 4. Extract user info from GitHub API response
# 5. Upsert auth_identity with provider='github'
# 6. Follow same pattern as google_login
#
# Example skeleton:
#
# @router.post("/github", response_model=TokenResponse)
# async def github_login(
#     code: str,  # Authorization code from GitHub OAuth redirect
#     response: Response,
#     db: AsyncSession = Depends(get_db),
# ) -> TokenResponse:
#     # 1. Exchange code for access_token via GitHub API
#     # 2. Fetch user info from https://api.github.com/user
#     # 3. Extract provider_user_id = str(github_user["id"])
#     # 4. Upsert auth_identity + user (same pattern as above)
#     # 5. Return JWT
#     ...
