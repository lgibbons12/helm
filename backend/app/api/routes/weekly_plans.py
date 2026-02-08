"""Weekly plan CRUD routes."""

from datetime import date, timedelta

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import WeeklyPlan
from app.schemas.weekly_plans import WeeklyPlanRead, WeeklyPlanUpsert

router = APIRouter(prefix="/weekly-plan", tags=["weekly-plan"])


def _current_week_monday() -> date:
    """Return the Monday of the current week."""
    today = date.today()
    return today - timedelta(days=today.weekday())


@router.get("/", response_model=WeeklyPlanRead | None)
async def get_weekly_plan(
    current_user: CurrentUser,
    db: DbSession,
    week_start: date | None = None,
) -> WeeklyPlanRead | None:
    """
    Get the weekly plan for a specific week.

    If week_start is not provided, defaults to the current week (Monday).
    Returns null if no plan exists for that week yet.
    """
    target_week = week_start or _current_week_monday()

    result = await db.execute(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == current_user.id,
            WeeklyPlan.week_start == target_week,
        )
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        return None
    return WeeklyPlanRead.model_validate(plan)


@router.put("/", response_model=WeeklyPlanRead, status_code=status.HTTP_200_OK)
async def upsert_weekly_plan(
    data: WeeklyPlanUpsert,
    current_user: CurrentUser,
    db: DbSession,
) -> WeeklyPlanRead:
    """
    Create or update a weekly plan.

    If a plan for the given week_start already exists, its content is updated.
    Otherwise a new plan is created.
    """
    result = await db.execute(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == current_user.id,
            WeeklyPlan.week_start == data.week_start,
        )
    )
    plan = result.scalar_one_or_none()

    if plan:
        plan.content = data.content
    else:
        plan = WeeklyPlan(
            user_id=current_user.id,
            week_start=data.week_start,
            content=data.content,
        )
        db.add(plan)

    await db.commit()
    await db.refresh(plan)
    return WeeklyPlanRead.model_validate(plan)
