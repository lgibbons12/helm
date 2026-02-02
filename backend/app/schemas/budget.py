"""Budget settings schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class BudgetSettingsRead(BaseSchema):
    """Schema for reading budget settings."""

    user_id: UUID
    large_expense_threshold: Decimal | None = Field(None, ge=0)
    weekly_budget_target: Decimal | None = Field(None, ge=0)
    created_at: datetime
    updated_at: datetime


class BudgetSettingsUpdate(BaseSchema):
    """Schema for updating budget settings."""

    large_expense_threshold: Decimal | None = Field(None, ge=0)
    weekly_budget_target: Decimal | None = Field(None, ge=0)
