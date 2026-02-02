"""Transaction schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema


class TransactionBase(BaseSchema):
    """Base transaction schema."""

    date: date
    amount_signed: Decimal = Field(..., decimal_places=2)
    merchant: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    note: str | None = None
    is_income: bool = False

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


class TransactionRead(TransactionBase):
    """Schema for reading transaction data."""

    id: UUID
    user_id: UUID
    created_at: datetime
