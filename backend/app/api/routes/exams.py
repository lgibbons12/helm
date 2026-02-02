"""Exam CRUD routes."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import Exam
from app.schemas.exams import ExamCreate, ExamRead, ExamUpdate

router = APIRouter(prefix="/exams", tags=["exams"])


@router.get("/", response_model=list[ExamRead])
async def list_exams(
    current_user: CurrentUser,
    db: DbSession,
    class_id: UUID | None = None,
    upcoming_only: bool = False,
) -> list[ExamRead]:
    """
    List exams for the current user.
    
    Filters:
    - class_id: Filter by class
    - upcoming_only: Only show exams with exam_datetime >= now
    """
    query = select(Exam).where(Exam.user_id == current_user.id)
    
    if class_id:
        query = query.where(Exam.class_id == class_id)
    if upcoming_only:
        query = query.where(Exam.exam_datetime >= datetime.now())
    
    query = query.order_by(Exam.exam_datetime.asc().nullslast())
    
    result = await db.execute(query)
    return [ExamRead.model_validate(e) for e in result.scalars()]


@router.post("/", response_model=ExamRead, status_code=status.HTTP_201_CREATED)
async def create_exam(
    data: ExamCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> ExamRead:
    """Create a new exam."""
    new_exam = Exam(
        user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(new_exam)
    await db.commit()
    await db.refresh(new_exam)
    return ExamRead.model_validate(new_exam)


@router.get("/{exam_id}", response_model=ExamRead)
async def get_exam(
    exam_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ExamRead:
    """Get a specific exam by ID."""
    exam = await get_user_resource_or_404(db, Exam, exam_id, current_user.id)
    return ExamRead.model_validate(exam)


@router.patch("/{exam_id}", response_model=ExamRead)
async def update_exam(
    exam_id: UUID,
    data: ExamUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> ExamRead:
    """Update an exam."""
    exam = await get_user_resource_or_404(db, Exam, exam_id, current_user.id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(exam, key, value)
    await db.commit()
    await db.refresh(exam)
    return ExamRead.model_validate(exam)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(
    exam_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete an exam."""
    exam = await get_user_resource_or_404(db, Exam, exam_id, current_user.id)
    await db.delete(exam)
    await db.commit()
