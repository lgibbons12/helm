"""Transaction CRUD routes."""

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select, and_

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


@router.get("/stats/breakdown")
async def get_breakdown(
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Get breakdown of expenses by weekly vs large/one-time.
    """
    query = select(
        func.sum(func.abs(Transaction.amount_signed)).filter(
            and_(Transaction.is_income == False, Transaction.is_weekly == True)
        ).label("weekly_total"),
        func.sum(func.abs(Transaction.amount_signed)).filter(
            and_(Transaction.is_income == False, Transaction.is_weekly == False)
        ).label("large_total"),
    ).where(Transaction.user_id == current_user.id)
    
    result = await db.execute(query)
    row = result.one()
    
    weekly = float(row.weekly_total or 0)
    large = float(row.large_total or 0)
    total = weekly + large
    
    return {
        "weekly": weekly,
        "large": large,
        "total": total,
        "weekly_pct": round(weekly / total * 100, 1) if total > 0 else 0,
        "large_pct": round(large / total * 100, 1) if total > 0 else 0,
    }


@router.get("/stats/trend")
async def get_trend(
    current_user: CurrentUser,
    db: DbSession,
    days: int = 30,
) -> list[dict]:
    """
    Get daily spending trend for the past N days.
    Returns list of {date, expenses, income} for charting.
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    query = select(
        Transaction.date,
        func.sum(func.abs(Transaction.amount_signed)).filter(Transaction.is_income == False).label("expenses"),
        func.sum(Transaction.amount_signed).filter(Transaction.is_income == True).label("income"),
    ).where(
        Transaction.user_id == current_user.id,
        Transaction.date >= start_date,
        Transaction.date <= end_date,
    ).group_by(Transaction.date).order_by(Transaction.date)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Create a dict of existing data
    data_by_date = {
        row.date.isoformat(): {
            "date": row.date.isoformat(),
            "expenses": float(row.expenses or 0),
            "income": float(row.income or 0),
        }
        for row in rows
    }
    
    # Fill in missing dates with zeros
    trend = []
    current = start_date
    while current <= end_date:
        date_str = current.isoformat()
        if date_str in data_by_date:
            trend.append(data_by_date[date_str])
        else:
            trend.append({"date": date_str, "expenses": 0, "income": 0})
        current += timedelta(days=1)
    
    return trend


@router.get("/stats/weekly-average")
async def get_weekly_average(
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Get average weekly spending based on all transactions.
    """
    # Get the date range of all transactions
    range_query = select(
        func.min(Transaction.date).label("first_date"),
        func.max(Transaction.date).label("last_date"),
        func.sum(func.abs(Transaction.amount_signed)).filter(Transaction.is_income == False).label("total_expenses"),
    ).where(Transaction.user_id == current_user.id)
    
    result = await db.execute(range_query)
    row = result.one()
    
    if not row.first_date or not row.last_date:
        return {"weekly_average": 0, "weeks_tracked": 0, "total_expenses": 0}
    
    # Calculate number of weeks
    days_tracked = (row.last_date - row.first_date).days + 1
    weeks_tracked = max(days_tracked / 7, 1)
    total_expenses = float(row.total_expenses or 0)
    
    return {
        "weekly_average": round(total_expenses / weeks_tracked, 2),
        "weeks_tracked": round(weeks_tracked, 1),
        "total_expenses": total_expenses,
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
