from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Product, Sale, SaleItem
from ..schemas import CheckoutRequest, CheckoutResponse, SaleItemOut, StockUpdate

router = APIRouter(tags=["checkout"])

CENT = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _response(
    sale: Sale,
    items: list[SaleItemOut],
    stock_updates: list[StockUpdate],
    duplicate: bool,
) -> CheckoutResponse:
    return CheckoutResponse(
        sale_id=sale.id,
        client_ref=sale.client_ref,
        total_amount=sale.total_amount,
        net_profit=sale.net_profit,
        item_count=sum(i.quantity_sold for i in items),
        created_at=sale.created_at,
        items=items,
        stock_updates=stock_updates,
        duplicate=duplicate,
    )


def _items_from_orm(sale: Sale) -> list[SaleItemOut]:
    # Sale.items (selectin) and SaleItem.product (joined) are eager-loaded.
    return [
        SaleItemOut(
            product_id=i.product_id,
            name=i.product.name,
            quantity_sold=i.quantity_sold,
            unit_price=i.unit_price,
            line_total=_q(i.unit_price * i.quantity_sold),
        )
        for i in sale.items
    ]


async def _existing_sale(db: AsyncSession, client_ref: str) -> Sale | None:
    return await db.scalar(select(Sale).where(Sale.client_ref == client_ref))


@router.post("/checkout", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def checkout(payload: CheckoutRequest, db: AsyncSession = Depends(get_db)):
    """Record a sale and deduct stock in ONE transaction.

    * Idempotent on `client_ref`: replaying the same request returns the
      original sale (duplicate=true) instead of selling twice.
    * Prices and costs come from the database at the moment of deduction
      (UPDATE ... RETURNING), never from the client - except for offline
      replays, which keep the price the customer saw at the till.
    * Stock is deducted with a guarded UPDATE (`stock >= qty`), so two tills
      selling the last item can't both succeed and stock can't go negative.
      Rows are touched in ascending id order so concurrent checkouts can't
      deadlock each other.
    """
    # 1. Idempotency fast-path.
    if payload.client_ref:
        existing = await _existing_sale(db, payload.client_ref)
        if existing:
            return _response(existing, _items_from_orm(existing), [], duplicate=True)

    # 2. Resolve every line to a product id with one query.
    ids = {l.product_id for l in payload.items if l.product_id is not None}
    codes = {l.barcode for l in payload.items if l.barcode}
    rows = (
        await db.execute(
            select(Product.id, Product.barcode).where(
                (Product.id.in_(ids)) | (Product.barcode.in_(codes))
            )
        )
    ).all()
    by_id = {r.id for r in rows}
    by_code = {r.barcode: r.id for r in rows}

    wanted_qty: dict[int, int] = {}
    price_override: dict[int, Decimal] = {}
    unknown: list[str] = []
    for line in payload.items:
        pid = line.product_id if line.product_id in by_id else by_code.get(line.barcode or "")
        if pid is None:
            unknown.append(str(line.product_id if line.product_id is not None else line.barcode))
            continue
        wanted_qty[pid] = wanted_qty.get(pid, 0) + line.quantity
        if payload.offline and line.unit_price is not None:
            price_override[pid] = line.unit_price
    if unknown:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, {"message": "Unknown products", "products": unknown}
        )

    # 3. Atomic, guarded stock deduction.
    total = Decimal("0")
    profit = Decimal("0")
    sale_items: list[SaleItem] = []
    items_out: list[SaleItemOut] = []
    stock_updates: list[StockUpdate] = []
    short: list[dict] = []

    try:
        for pid in sorted(wanted_qty):
            qty = wanted_qty[pid]
            stmt = (
                update(Product)
                .where(Product.id == pid)
                .values(stock_quantity=Product.stock_quantity - qty)
                .returning(
                    Product.id,
                    Product.name,
                    Product.selling_price,
                    Product.cost_price,
                    Product.stock_quantity,
                    Product.low_stock_threshold,
                )
                .execution_options(synchronize_session=False)
            )
            if not (payload.offline or payload.allow_oversell):
                stmt = stmt.where(Product.stock_quantity >= qty)

            row = (await db.execute(stmt)).first()
            if row is None:
                # The product exists (step 2), so the guard rejected it.
                available = await db.scalar(select(Product.stock_quantity).where(Product.id == pid))
                name = await db.scalar(select(Product.name).where(Product.id == pid))
                short.append(
                    {"product_id": pid, "name": name, "requested": qty, "available": available}
                )
                continue

            price = price_override.get(pid, row.selling_price)
            total += price * qty
            profit += (price - row.cost_price) * qty
            sale_items.append(SaleItem(product_id=pid, quantity_sold=qty, unit_price=price))
            items_out.append(
                SaleItemOut(
                    product_id=pid,
                    name=row.name,
                    quantity_sold=qty,
                    unit_price=price,
                    line_total=_q(price * qty),
                )
            )
            stock_updates.append(
                StockUpdate(
                    product_id=row.id,
                    stock_quantity=row.stock_quantity,
                    low_stock_threshold=row.low_stock_threshold,
                    is_low=row.stock_quantity < row.low_stock_threshold,
                )
            )

        if short:
            await db.rollback()  # undo any deductions already applied in this loop
            raise HTTPException(
                status.HTTP_409_CONFLICT, {"message": "Insufficient stock", "products": short}
            )

        # 4. Log the sale.
        sale = Sale(
            client_ref=payload.client_ref,
            total_amount=_q(total),
            net_profit=_q(profit),
            items=sale_items,
        )
        if payload.offline and payload.sold_at:
            sold_at = payload.sold_at
            if sold_at.tzinfo is None:
                sold_at = sold_at.replace(tzinfo=timezone.utc)
            sale.created_at = min(sold_at, datetime.now(timezone.utc))  # never in the future

        db.add(sale)
        await db.commit()
    except IntegrityError:
        # Lost a race against an identical client_ref: return the winner.
        await db.rollback()
        if payload.client_ref:
            existing = await _existing_sale(db, payload.client_ref)
            if existing:
                return _response(existing, _items_from_orm(existing), [], duplicate=True)
        raise
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        raise

    await db.refresh(sale, ["created_at"])  # server-generated timestamp
    return _response(sale, items_out, stock_updates, duplicate=False)
