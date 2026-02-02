"""Budget settings routes."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import BudgetSettings
from app.schemas.budget import BudgetSettingsRead, BudgetSettingsUpdate

router = APIRouter(prefix="/budget", tags=["budget"])


@router.get("/settings", response_model=BudgetSettingsRead)
async def get_budget_settings(
    current_user: CurrentUser,
    db: DbSession,
) -> BudgetSettingsRead:
    """Get budget settings for the current user."""
    result = await db.execute(
        select(BudgetSettings).where(BudgetSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    if settings is None:
        # Return defaults if no settings exist
        # Create default settings on first access
        settings = BudgetSettings(user_id=current_user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    
    return BudgetSettingsRead.model_validate(settings)


@router.patch("/settings", response_model=BudgetSettingsRead)
async def update_budget_settings(
    data: BudgetSettingsUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> BudgetSettingsRead:
    """Update budget settings for the current user."""
    result = await db.execute(
        select(BudgetSettings).where(BudgetSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    if settings is None:
        # Create if doesn't exist
        settings = BudgetSettings(
            user_id=current_user.id,
            **data.model_dump(exclude_unset=True),
        )
        db.add(settings)
    else:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(settings, key, value)
    
    await db.commit()
    await db.refresh(settings)
    return BudgetSettingsRead.model_validate(settings)
