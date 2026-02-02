"""Assignment CRUD routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import Assignment, AssignmentStatus
from app.schemas.assignments import AssignmentCreate, AssignmentRead, AssignmentUpdate

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/", response_model=list[AssignmentRead])
async def list_assignments(
    current_user: CurrentUser,
    db: DbSession,
    class_id: UUID | None = None,
    status: str | None = None,
    due_before: date | None = None,
    due_after: date | None = None,
) -> list[AssignmentRead]:
    """
    List assignments for the current user.
    
    Filters:
    - class_id: Filter by class
    - status: Filter by status (not_started, in_progress, done)
    - due_before/due_after: Filter by due date range
    """
    query = select(Assignment).where(Assignment.user_id == current_user.id)
    
    if class_id:
        query = query.where(Assignment.class_id == class_id)
    if status:
        query = query.where(Assignment.status == status)
    if due_before:
        query = query.where(Assignment.due_date <= due_before)
    if due_after:
        query = query.where(Assignment.due_date >= due_after)
    
    query = query.order_by(Assignment.due_date.asc().nullslast(), Assignment.created_at.desc())
    
    result = await db.execute(query)
    return [AssignmentRead.model_validate(a) for a in result.scalars()]


@router.post("/", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    data: AssignmentCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> AssignmentRead:
    """Create a new assignment."""
    new_assignment = Assignment(
        user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(new_assignment)
    await db.commit()
    await db.refresh(new_assignment)
    return AssignmentRead.model_validate(new_assignment)


@router.get("/{assignment_id}", response_model=AssignmentRead)
async def get_assignment(
    assignment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> AssignmentRead:
    """Get a specific assignment by ID."""
    assignment = await get_user_resource_or_404(db, Assignment, assignment_id, current_user.id)
    return AssignmentRead.model_validate(assignment)


@router.patch("/{assignment_id}", response_model=AssignmentRead)
async def update_assignment(
    assignment_id: UUID,
    data: AssignmentUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> AssignmentRead:
    """Update an assignment."""
    assignment = await get_user_resource_or_404(db, Assignment, assignment_id, current_user.id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(assignment, key, value)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentRead.model_validate(assignment)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete an assignment."""
    assignment = await get_user_resource_or_404(db, Assignment, assignment_id, current_user.id)
    await db.delete(assignment)
    await db.commit()
