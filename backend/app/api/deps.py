"""
FastAPI Dependencies for Authentication and Authorization.

Key patterns:
1. get_current_user: Extracts and validates JWT, returns User object
2. User-scoped queries: All repository functions accept user_id to enforce ownership
3. No global "current user" state - always pass user explicitly

Security model:
- JWT stored in HttpOnly cookie (recommended) or Authorization header
- All domain data queries are scoped by user_id at the SQL level
- Ownership checks happen in business logic, not middleware
"""

from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import User
from app.db.session import get_db

settings = get_settings()


# =============================================================================
# JWT UTILITIES
# =============================================================================


def create_access_token(user_id: UUID) -> str:
    """
    Create a JWT access token for a user.

    Token payload contains:
    - sub: user_id as string (standard JWT subject claim)
    - exp: expiration timestamp (handled by PyJWT)

    Security notes:
    - We do NOT store sensitive data in JWT (email, name, etc.)
    - Token is stateless; revocation requires token blocklist (not implemented)
    """
    from datetime import datetime, timedelta, timezone

    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> UUID | None:
    """
    Decode and validate a JWT access token.

    Returns user_id if valid, None if invalid/expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        return UUID(user_id_str)
    except (JWTError, ValueError):
        return None


# =============================================================================
# AUTHENTICATION DEPENDENCIES
# =============================================================================


async def get_token_from_request(
    authorization: Annotated[str | None, Header()] = None,
    access_token: Annotated[str | None, Cookie()] = None,
) -> str:
    """
    Extract JWT token from request.

    Supports two methods (in order of preference):
    1. HttpOnly cookie named 'access_token' (recommended for web apps)
    2. Authorization header: 'Bearer <token>'

    Cookie-based auth is preferred because:
    - Automatically sent with requests (no JS needed)
    - HttpOnly prevents XSS token theft
    - SameSite=Lax prevents CSRF for GET requests
    """
    # Try cookie first
    if access_token:
        return access_token

    # Fall back to Authorization header
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1]

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    token: Annotated[str, Depends(get_token_from_request)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    Validate JWT and return the current authenticated user.

    This is the primary authentication dependency. Use it in route handlers:

        @router.get("/assignments")
        async def list_assignments(user: User = Depends(get_current_user)):
            # user is guaranteed to be authenticated
            ...

    Raises 401 if:
    - Token is missing, invalid, or expired
    - User no longer exists in database
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user_id = decode_access_token(token)
    if user_id is None:
        raise credentials_exception

    # Fetch user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


# Type alias for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


# =============================================================================
# AUTHORIZATION HELPERS
# =============================================================================


def require_owner(resource_user_id: UUID, current_user: User) -> None:
    """
    Verify the current user owns the resource.

    Use this when fetching a specific resource by ID to ensure ownership:

        assignment = await get_assignment_by_id(db, assignment_id)
        if assignment is None:
            raise HTTPException(404)
        require_owner(assignment.user_id, current_user)  # Raises 403 if not owner

    Design note:
    We return 403 Forbidden (not 404) when user doesn't own resource.
    This reveals resource existence but is clearer for debugging.
    For stricter security, return 404 for both not-found and not-owned.
    """
    if resource_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource",
        )


def verify_ownership_or_404(resource: object | None, current_user: User) -> None:
    """
    Combined check: resource exists AND user owns it.

    Returns 404 for both cases (privacy-preserving):

        assignment = await get_assignment_by_id(db, assignment_id)
        verify_ownership_or_404(assignment, current_user)
        # If we get here, assignment exists and user owns it
    """
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    if not hasattr(resource, "user_id"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    if resource.user_id != current_user.id:
        # Return 404 to not reveal resource existence
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")


# =============================================================================
# QUERY HELPERS (enforce user scoping at query level)
# =============================================================================


async def get_user_resource_or_404(
    db: AsyncSession,
    model: type,
    resource_id: UUID,
    user_id: UUID,
):
    """
    Generic helper to fetch a user-owned resource by ID.

    Usage:
        assignment = await get_user_resource_or_404(
            db, Assignment, assignment_id, current_user.id
        )

    This enforces user scoping at the SQL level (WHERE user_id = ...).
    """
    result = await db.execute(
        select(model).where(model.id == resource_id, model.user_id == user_id)
    )
    resource = result.scalar_one_or_none()

    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    return resource
