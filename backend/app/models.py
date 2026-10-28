from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("cost_price >= 0", name="ck_products_cost_nonneg"),
        CheckConstraint("selling_price >= 0", name="ck_products_price_nonneg"),
        CheckConstraint("low_stock_threshold >= 0", name="ck_products_threshold_nonneg"),
        # NOTE: stock_quantity is deliberately NOT constrained to >= 0.
        # Sales that were rung up while offline are goods that already left the
        # shelf; when they sync we must record them even if the count goes
        # negative (it then shows up red on the low-stock table).
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Unique + indexed: the scanner hot path is "WHERE barcode = :code".
    barcode: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    category: Mapped[str] = mapped_column(String(100), index=True)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    selling_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    # Optional photo URL. When empty the UI draws an illustrated tile instead.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Client-generated UUID. Makes checkout idempotent so a retried or
    # re-synced offline sale can never be recorded twice.
    client_ref: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    net_profit: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", lazy="selectin"
    )


class SaleItem(Base):
    __tablename__ = "sale_items"
    __table_args__ = (CheckConstraint("quantity_sold > 0", name="ck_sale_items_qty_pos"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    # RESTRICT: a product with sales history can't be hard-deleted.
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    quantity_sold: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    sale: Mapped[Sale] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(lazy="joined")
