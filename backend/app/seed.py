"""Demo data:  python -m app.seed [--with-sales]

Safe to re-run: products are upserted by barcode. --with-sales adds ~14 days of
random history so the dashboard has something to draw (run it once).
"""
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from .database import SessionLocal, engine
from .models import Base, Product, Sale, SaleItem

# barcode, name, category, cost, price, stock, low-stock threshold
PRODUCTS = [
    ("8901030000011", "Basmati Rice 5kg", "Grocery", "420", "499", 40, 10),
    ("8901030000028", "Toor Dal 1kg", "Grocery", "118", "145", 55, 15),
    ("8901030000035", "Sunflower Oil 1L", "Grocery", "128", "152", 8, 12),
    ("8901030000042", "Sugar 1kg", "Grocery", "40", "48", 70, 20),
    ("8901030000059", "Iodised Salt 1kg", "Grocery", "17", "24", 90, 20),
    ("8901030000066", "Whole Wheat Atta 5kg", "Grocery", "205", "245", 32, 10),
    ("8901030000073", "Tea Powder 500g", "Beverages", "180", "225", 25, 8),
    ("8901030000080", "Instant Coffee 100g", "Beverages", "190", "240", 4, 8),
    ("8901030000097", "Cola 750ml", "Beverages", "32", "40", 120, 24),
    ("8901030000103", "Orange Juice 1L", "Beverages", "78", "99", 18, 10),
    ("8901030000110", "Full Cream Milk 1L", "Dairy", "58", "68", 36, 20),
    ("8901030000127", "Curd 400g", "Dairy", "30", "40", 22, 12),
    ("8901030000134", "Salted Butter 100g", "Dairy", "52", "62", 3, 10),
    ("8901030000141", "Paneer 200g", "Dairy", "70", "90", 14, 8),
    ("8901030000158", "Potato Chips 52g", "Snacks", "14", "20", 150, 30),
    ("8901030000165", "Chocolate Bar 40g", "Snacks", "32", "45", 85, 20),
    ("8901030000172", "Digestive Biscuits 250g", "Snacks", "38", "50", 60, 15),
    ("8901030000189", "Instant Noodles 70g", "Snacks", "11", "15", 200, 40),
    ("8901030000196", "Dish Wash Liquid 500ml", "Household", "78", "99", 28, 10),
    ("8901030000202", "Laundry Detergent 1kg", "Household", "110", "139", 21, 10),
    ("8901030000219", "Toilet Cleaner 500ml", "Household", "72", "92", 0, 8),
    ("8901030000226", "Bath Soap 100g", "Personal Care", "28", "38", 75, 20),
    ("8901030000233", "Shampoo 180ml", "Personal Care", "98", "125", 19, 10),
    ("8901030000240", "Toothpaste 150g", "Personal Care", "68", "89", 44, 15),
    ("8901030000257", "Bananas (dozen)", "Produce", "35", "50", 30, 10),
    ("8901030000264", "Tomatoes 1kg", "Produce", "22", "35", 25, 10),
    ("8901030000271", "Onions 1kg", "Produce", "26", "38", 6, 15),
]


async def main(with_sales: bool) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        for barcode, name, cat, cost, price, stock, thr in PRODUCTS:
            row = dict(
                barcode=barcode, name=name, category=cat,
                cost_price=Decimal(cost), selling_price=Decimal(price),
                stock_quantity=stock, low_stock_threshold=thr,
            )
            await db.execute(
                insert(Product).values(**row).on_conflict_do_update(
                    index_elements=[Product.barcode], set_=row
                )
            )
        await db.commit()
        print(f"Upserted {len(PRODUCTS)} products")

        if not with_sales:
            return

        products = (await db.scalars(select(Product))).all()
        rng = random.Random(7)
        now = datetime.now(timezone.utc)
        n_sales = 0
        for days_ago in range(13, -1, -1):
            for _ in range(rng.randint(18, 45)):
                picks = rng.sample(products, rng.randint(1, 6))
                items, total, profit = [], Decimal(0), Decimal(0)
                for p in picks:
                    q = rng.randint(1, 4)
                    items.append(SaleItem(product_id=p.id, quantity_sold=q, unit_price=p.selling_price))
                    total += p.selling_price * q
                    profit += (p.selling_price - p.cost_price) * q
                when = now - timedelta(days=days_ago, hours=rng.randint(0, 11), minutes=rng.randint(0, 59))
                if when > now:
                    when = now
                db.add(Sale(total_amount=total, net_profit=profit, created_at=when, items=items))
                n_sales += 1
        await db.commit()
        print(f"Added {n_sales} demo sales")


if __name__ == "__main__":
    asyncio.run(main("--with-sales" in sys.argv))
