"""Transaction CRUD routes."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import Transaction
from app.schemas.transactions import TransactionCreate, TransactionRead

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("/", response_model=list[TransactionRead])
async def list_transactions(
    current_user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    is_income: bool | None = None,
) -> list[TransactionRead]:
    """
    List transactions for the current user.
    
    Filters:
    - date_from/date_to: Filter by date range
    - category: Filter by category
    - is_income: Filter by income/expense
    """
    query = select(Transaction).where(Transaction.user_id == current_user.id)
    
    if date_from:
        query = query.where(Transaction.date >= date_from)
    if date_to:
        query = query.where(Transaction.date <= date_to)
    if category:
        query = query.where(Transaction.category == category)
    if is_income is not None:
        query = query.where(Transaction.is_income == is_income)
    
    query = query.order_by(Transaction.date.desc(), Transaction.created_at.desc())
    
    result = await db.execute(query)
    return [TransactionRead.model_validate(t) for t in result.scalars()]


@router.get("/summary")
async def get_transaction_summary(
    current_user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """
    Get a summary of transactions (total income, expenses, net).
    
    Filters:
    - date_from/date_to: Filter by date range
    """
    query = select(
        func.sum(Transaction.amount_signed).filter(Transaction.is_income == True).label("total_income"),
        func.sum(Transaction.amount_signed).filter(Transaction.is_income == False).label("total_expenses"),
        func.sum(Transaction.amount_signed).label("net"),
    ).where(Transaction.user_id == current_user.id)
    
    if date_from:
        query = query.where(Transaction.date >= date_from)
    if date_to:
        query = query.where(Transaction.date <= date_to)
    
    result = await db.execute(query)
    row = result.one()
    
    return {
        "total_income": float(row.total_income or 0),
        "total_expenses": float(row.total_expenses or 0),
        "net": float(row.net or 0),
    }


@router.post("/", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> TransactionRead:
    """Create a new transaction."""
    new_transaction = Transaction(
        user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(new_transaction)
    await db.commit()
    await db.refresh(new_transaction)
    return TransactionRead.model_validate(new_transaction)


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> TransactionRead:
    """Get a specific transaction by ID."""
    transaction = await get_user_resource_or_404(db, Transaction, transaction_id, current_user.id)
    return TransactionRead.model_validate(transaction)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a transaction. Transactions are typically immutable, so no update endpoint."""
    transaction = await get_user_resource_or_404(db, Transaction, transaction_id, current_user.id)
    await db.delete(transaction)
    await db.commit()
