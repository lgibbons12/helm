"""Transaction CRUD routes."""

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select, and_, case

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import Transaction, BudgetSettings
from app.schemas.transactions import TransactionCreate, TransactionRead, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _monday_of(d: date) -> date:
    """Return the Monday of the week containing date d."""
    return d - timedelta(days=d.weekday())


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


@router.get("/stats/week-summary")
async def get_week_summary(
    current_user: CurrentUser,
    db: DbSession,
    week_start: date | None = None,
) -> dict:
    """
    Get everything needed for the week navigator for a single week.
    Defaults to current week's Monday if no week_start param.
    """
    if week_start is None:
        week_start = _monday_of(date.today())
    else:
        # Snap to Monday in case caller sends a non-Monday
        week_start = _monday_of(week_start)

    week_end = week_start + timedelta(days=6)

    # Fetch all expense transactions for this week
    txn_query = (
        select(Transaction)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.is_income == False,
            Transaction.date >= week_start,
            Transaction.date <= week_end,
        )
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
    )
    txn_result = await db.execute(txn_query)
    transactions = list(txn_result.scalars())

    weekly_txns = [t for t in transactions if t.is_weekly]
    extraneous_txns = [t for t in transactions if not t.is_weekly]

    weekly_spend = sum(abs(float(t.amount_signed)) for t in weekly_txns)
    extraneous_spend = sum(abs(float(t.amount_signed)) for t in extraneous_txns)
    total_spend = weekly_spend + extraneous_spend

    # Category breakdown (weekly expenses only)
    cat_map: dict[str, float] = {}
    for t in weekly_txns:
        cat = t.category or "other"
        cat_map[cat] = cat_map.get(cat, 0) + abs(float(t.amount_signed))
    category_breakdown = [{"category": c, "amount": a} for c, a in sorted(cat_map.items(), key=lambda x: -x[1])]

    # Budget target from settings
    settings_result = await db.execute(
        select(BudgetSettings).where(BudgetSettings.user_id == current_user.id)
    )
    settings = settings_result.scalar_one_or_none()
    budget_target = float(settings.weekly_budget_target) if settings and settings.weekly_budget_target else None
    budget_remaining = (budget_target - weekly_spend) if budget_target is not None else None

    all_txn_read = [TransactionRead.model_validate(t).model_dump(mode="json") for t in transactions]

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "weekly_spend": round(weekly_spend, 2),
        "extraneous_spend": round(extraneous_spend, 2),
        "total_spend": round(total_spend, 2),
        "budget_target": budget_target,
        "budget_remaining": round(budget_remaining, 2) if budget_remaining is not None else None,
        "transactions": all_txn_read,
        "category_breakdown": category_breakdown,
    }


@router.get("/stats/multi-week")
async def get_multi_week(
    current_user: CurrentUser,
    db: DbSession,
    weeks: int = 8,
) -> list[dict]:
    """
    For the multi-week comparison bar chart.
    Groups all expenses by their Monday-Sunday week, fills empty weeks with zeros.
    """
    today = date.today()
    current_monday = _monday_of(today)
    start_monday = current_monday - timedelta(weeks=weeks - 1)

    # Fetch all expenses in range
    query = (
        select(Transaction)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.is_income == False,
            Transaction.date >= start_monday,
            Transaction.date <= current_monday + timedelta(days=6),
        )
    )
    result = await db.execute(query)
    rows = list(result.scalars())

    # Build week buckets
    week_data: dict[str, dict] = {}
    for i in range(weeks):
        monday = start_monday + timedelta(weeks=i)
        key = monday.isoformat()
        week_data[key] = {"week_start": key, "weekly_spend": 0.0, "extraneous_spend": 0.0, "total_spend": 0.0}

    for t in rows:
        monday = _monday_of(t.date)
        key = monday.isoformat()
        if key not in week_data:
            continue
        amt = abs(float(t.amount_signed))
        if t.is_weekly:
            week_data[key]["weekly_spend"] += amt
        else:
            week_data[key]["extraneous_spend"] += amt
        week_data[key]["total_spend"] += amt

    # Round values
    entries = []
    for key in sorted(week_data.keys()):
        d = week_data[key]
        entries.append({
            "week_start": d["week_start"],
            "weekly_spend": round(d["weekly_spend"], 2),
            "extraneous_spend": round(d["extraneous_spend"], 2),
            "total_spend": round(d["total_spend"], 2),
        })

    return entries


@router.get("/stats/income-summary")
async def get_income_summary(
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Separate income tracking: total, by-source, recent, monthly trend.
    """
    # Total income
    total_query = select(
        func.sum(Transaction.amount_signed).label("total"),
    ).where(
        Transaction.user_id == current_user.id,
        Transaction.is_income == True,
    )
    total_result = await db.execute(total_query)
    total_income = float(total_result.scalar_one_or_none() or 0)

    # By source
    source_col = func.coalesce(Transaction.income_source, "other")
    source_query = select(
        source_col.label("source"),
        func.sum(Transaction.amount_signed).label("amount"),
    ).where(
        Transaction.user_id == current_user.id,
        Transaction.is_income == True,
    ).group_by(source_col)
    source_result = await db.execute(source_query)
    by_source = [
        {"source": row.source, "amount": float(row.amount or 0)}
        for row in source_result.all()
    ]

    # Recent income (last 10)
    recent_query = (
        select(Transaction)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.is_income == True,
        )
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(10)
    )
    recent_result = await db.execute(recent_query)
    recent = [TransactionRead.model_validate(t).model_dump(mode="json") for t in recent_result.scalars()]

    # Monthly trend
    month_col = func.to_char(Transaction.date, "YYYY-MM")
    monthly_query = select(
        month_col.label("month"),
        func.sum(Transaction.amount_signed).label("amount"),
    ).where(
        Transaction.user_id == current_user.id,
        Transaction.is_income == True,
    ).group_by(month_col).order_by(month_col)
    monthly_result = await db.execute(monthly_query)
    monthly_trend = [
        {"month": row.month, "amount": float(row.amount or 0)}
        for row in monthly_result.all()
    ]

    return {
        "total_income": total_income,
        "by_source": by_source,
        "recent": recent,
        "monthly_trend": monthly_trend,
    }


@router.get("/stats/balance")
async def get_balance(
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Overall balance computation:
    current_balance = starting_balance + total_income + total_expenses
    (total_expenses is negative)
    """
    # Get starting balance
    settings_result = await db.execute(
        select(BudgetSettings).where(BudgetSettings.user_id == current_user.id)
    )
    settings = settings_result.scalar_one_or_none()
    starting_balance = float(settings.starting_balance) if settings and settings.starting_balance else 0.0

    # Get totals
    totals_query = select(
        func.sum(Transaction.amount_signed).filter(Transaction.is_income == True).label("total_income"),
        func.sum(Transaction.amount_signed).filter(Transaction.is_income == False).label("total_expenses"),
    ).where(Transaction.user_id == current_user.id)
    totals_result = await db.execute(totals_query)
    row = totals_result.one()

    total_income = float(row.total_income or 0)
    total_expenses = float(row.total_expenses or 0)
    current_balance = starting_balance + total_income + total_expenses

    return {
        "starting_balance": starting_balance,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "current_balance": round(current_balance, 2),
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


@router.put("/{transaction_id}", response_model=TransactionRead)
async def update_transaction(
    transaction_id: UUID,
    data: TransactionUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> TransactionRead:
    """Update a transaction. Cannot change is_income to prevent sign confusion."""
    transaction = await get_user_resource_or_404(db, Transaction, transaction_id, current_user.id)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(transaction, key, value)

    await db.commit()
    await db.refresh(transaction)
    return TransactionRead.model_validate(transaction)


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
    """Delete a transaction."""
    transaction = await get_user_resource_or_404(db, Transaction, transaction_id, current_user.id)
    await db.delete(transaction)
    await db.commit()
