"""Class/Course CRUD routes."""

import re
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import Class
from app.schemas.classes import ClassCreate, ClassRead, ClassUpdate

router = APIRouter(prefix="/classes", tags=["classes"])

# Seasons within a calendar year, earliest first. Mirrors SEASON_ORDER in
# frontend/src/lib/semester.ts -- keep the two in sync.
SEASON_ORDER = ("winter", "spring", "summer", "fall")

SEMESTER_PATTERN = re.compile(r"^\s*(winter|spring|summer|fall)\s+(\d{4})\s*$", re.IGNORECASE)


def semester_sort_key(semester: str) -> int:
    """Chronological sort key for a "<season> <year>" semester string.

    Returns -1 for values that do not match the expected shape so they sort last.
    """
    match = SEMESTER_PATTERN.match(semester)
    if not match:
        return -1
    return int(match.group(2)) * 10 + SEASON_ORDER.index(match.group(1).lower())


@router.get("/", response_model=list[ClassRead])
async def list_classes(
    current_user: CurrentUser,
    db: DbSession,
    semester: str | None = None,
) -> list[ClassRead]:
    """List all classes for the current user, optionally filtered by semester."""
    query = select(Class).where(Class.user_id == current_user.id)
    if semester:
        query = query.where(Class.semester == semester)

    result = await db.execute(query)
    # Sorted here rather than in SQL because "fall 2026" orders chronologically,
    # not alphabetically; a single user's class list is small enough for this.
    classes = sorted(
        result.scalars(),
        key=lambda c: (-semester_sort_key(c.semester), c.name.lower()),
    )
    return [ClassRead.model_validate(c) for c in classes]


@router.post("/", response_model=ClassRead, status_code=status.HTTP_201_CREATED)
async def create_class(
    data: ClassCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> ClassRead:
    """Create a new class."""
    new_class = Class(
        user_id=current_user.id,  # From auth, NEVER from request
        **data.model_dump(),
    )
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)
    return ClassRead.model_validate(new_class)


@router.get("/{class_id}", response_model=ClassRead)
async def get_class(
    class_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ClassRead:
    """Get a specific class by ID."""
    cls = await get_user_resource_or_404(db, Class, class_id, current_user.id)
    return ClassRead.model_validate(cls)


@router.patch("/{class_id}", response_model=ClassRead)
async def update_class(
    class_id: UUID,
    data: ClassUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> ClassRead:
    """Update a class."""
    cls = await get_user_resource_or_404(db, Class, class_id, current_user.id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cls, key, value)
    await db.commit()
    await db.refresh(cls)
    return ClassRead.model_validate(cls)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a class."""
    cls = await get_user_resource_or_404(db, Class, class_id, current_user.id)
    await db.delete(cls)
    await db.commit()
