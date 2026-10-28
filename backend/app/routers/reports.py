from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Sale, SaleItem
from ..schemas import DashboardPoint, DashboardResponse, DashboardTotals

router = APIRouter(prefix="/reports", tags=["reports"])
settings = get_settings()

GroupBy = Literal["day", "month", "year"]
DEFAULT_SPAN = {"day": 30, "month": 365, "year": 365 * 5}


def _period_key(d: date, group_by: GroupBy) -> str:
    if group_by == "day":
        return d.isoformat()
    if group_by == "month":
        return d.strftime("%Y-%m")
    return d.strftime("%Y")


def _all_periods(start: date, end: date, group_by: GroupBy) -> list[str]:
    """Every bucket between start and end so charts have no gaps."""
    keys: list[str] = []
    if group_by == "day":
        d = start
        while d <= end:
            keys.append(_period_key(d, group_by))
            d += timedelta(days=1)
    elif group_by == "month":
        y, m = start.year, start.month
        while (y, m) <= (end.year, end.month):
            keys.append(f"{y:04d}-{m:02d}")
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    else:
        keys = [f"{y:04d}" for y in range(start.year, end.year + 1)]
    return keys


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    group_by: GroupBy = Query("day"),
    start: date | None = Query(None, description="Inclusive, shop-local date"),
    end: date | None = Query(None, description="Inclusive, shop-local date (default: today)"),
    days: int | None = Query(
        None, ge=1, le=3660, description="Shortcut: the last N days ending at `end` (ignored if start is given)"
    ),
    db: AsyncSession = Depends(get_db),
):
    tz = settings.tz
    today = datetime.now(tz).date()
    end = end or today
    span = days if days is not None else DEFAULT_SPAN[group_by]
    start = start or (end - timedelta(days=span - 1))
    if start > end:
        raise HTTPException(422, "start must be on or before end")

    # created_at is compared raw (index-friendly); bucketing happens in shop-local time.
    lo = datetime.combine(start, time.min, tzinfo=tz)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)

    # group_by is validated by the Literal above and the timezone by
    # Settings, so inlining them as SQL literals is safe. We inline (rather
    # than bind) because Postgres can't prove `date_trunc($1, ...)` in SELECT
    # equals `date_trunc($3, ...)` in GROUP BY when they are separate bind
    # parameters.
    bucket = func.date_trunc(
        literal_column(f"'{group_by}'"),
        func.timezone(literal_column(f"'{settings.timezone}'"), Sale.created_at),
    )

    # Two separate aggregations, joined in Python: summing revenue over a
    # sales x sale_items join would count each sale once per line item.
    sales_q = (
        select(
            bucket.label("bucket"),
            func.coalesce(func.sum(Sale.total_amount), 0).label("revenue"),
            func.coalesce(func.sum(Sale.net_profit), 0).label("profit"),
            func.count(Sale.id).label("transactions"),
        )
        .where(Sale.created_at >= lo, Sale.created_at < hi)
        .group_by(bucket)
    )
    units_q = (
        select(
            bucket.label("bucket"),
            func.coalesce(func.sum(SaleItem.quantity_sold), 0).label("units"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.created_at >= lo, Sale.created_at < hi)
        .group_by(bucket)
    )

    sales_rows = (await db.execute(sales_q)).all()
    units_rows = (await db.execute(units_q)).all()

    units = {_period_key(r.bucket.date(), group_by): int(r.units) for r in units_rows}
    sales = {_period_key(r.bucket.date(), group_by): r for r in sales_rows}

    series: list[DashboardPoint] = []
    totals = {"revenue": Decimal(0), "profit": Decimal(0), "units": 0, "tx": 0}
    for key in _all_periods(start, end, group_by):
        row = sales.get(key)
        point = DashboardPoint(
            period=key,
            revenue=row.revenue if row else Decimal(0),
            net_profit=row.profit if row else Decimal(0),
            units_sold=units.get(key, 0),
            transactions=row.transactions if row else 0,
        )
        series.append(point)
        totals["revenue"] += point.revenue
        totals["profit"] += point.net_profit
        totals["units"] += point.units_sold
        totals["tx"] += point.transactions

    return DashboardResponse(
        group_by=group_by,
        start=start,
        end=end,
        totals=DashboardTotals(
            revenue=totals["revenue"],
            net_profit=totals["profit"],
            units_sold=totals["units"],
            transactions=totals["tx"],
        ),
        series=series,
    )
