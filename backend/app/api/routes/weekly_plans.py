"""Weekly plan CRUD routes."""

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import WeeklyPlan
from app.schemas.weekly_plans import WeeklyPlanRead, WeeklyPlanUpsert

router = APIRouter(prefix="/weekly-plan", tags=["weekly-plan"])


@router.get("/", response_model=WeeklyPlanRead | None)
async def get_weekly_plan(
    current_user: CurrentUser,
    db: DbSession,
) -> WeeklyPlanRead | None:
    """Get the user's plan. Returns null if no plan exists yet."""
    result = await db.execute(
        select(WeeklyPlan).where(WeeklyPlan.user_id == current_user.id)
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
    """Create or update the user's plan."""
    result = await db.execute(
        select(WeeklyPlan).where(WeeklyPlan.user_id == current_user.id)
    )
    plan = result.scalar_one_or_none()

    if plan:
        plan.content = data.content
    else:
        plan = WeeklyPlan(
            user_id=current_user.id,
            content=data.content,
        )
        db.add(plan)

    await db.commit()
    await db.refresh(plan)
    return WeeklyPlanRead.model_validate(plan)
