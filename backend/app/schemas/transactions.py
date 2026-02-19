"""Transaction schemas."""

import datetime as _dt
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema

EXPENSE_CATEGORIES = [
    "food", "transport", "entertainment", "shopping",
    "utilities", "health", "education", "other",
]


class TransactionBase(BaseSchema):
    """Base transaction schema."""

    date: _dt.date
    amount_signed: Decimal = Field(..., decimal_places=2)
    merchant: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    note: str | None = None
    is_income: bool = False
    is_weekly: bool = False
    income_source: str | None = Field(None, max_length=50)

    @model_validator(mode="after")
    def validate_amount_sign(self) -> "TransactionBase":
        """Ensure amount sign matches is_income flag."""
        if self.is_income and self.amount_signed <= 0:
            raise ValueError("Income transactions must have positive amount_signed")
        if not self.is_income and self.amount_signed > 0:
            raise ValueError("Expense transactions must have non-positive amount_signed")
        return self


class TransactionCreate(TransactionBase):
    """Schema for creating a transaction."""

    pass


class TransactionUpdate(BaseSchema):
    """Schema for updating a transaction. is_income excluded to prevent sign confusion."""

    date: _dt.date | None = None
    amount_signed: Decimal | None = Field(None, decimal_places=2)
    merchant: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    note: str | None = None
    is_weekly: bool | None = None
    income_source: str | None = Field(None, max_length=50)


class TransactionRead(TransactionBase):
    """Schema for reading transaction data."""

    id: UUID
    user_id: UUID
    created_at: _dt.datetime
