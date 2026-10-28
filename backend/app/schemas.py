from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

# Money is accepted as Decimal (exact) and emitted as a JSON number so the
# frontend doesn't have to parse strings.
Money = Annotated[
    Decimal,
    PlainSerializer(lambda v: float(v), return_type=float, when_used="json"),
]


# ---------------------------------------------------------------- products
class ProductBase(BaseModel):
    barcode: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=100)
    cost_price: Money = Field(ge=0, max_digits=12, decimal_places=2)
    selling_price: Money = Field(ge=0, max_digits=12, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=10, ge=0)
    image_url: str | None = Field(default=None, max_length=500)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    barcode: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    cost_price: Money | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    selling_price: Money | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    stock_quantity: int | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=500)


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Overrides the >= 0 rule: offline syncs can legitimately push stock negative.
    stock_quantity: int


# ---------------------------------------------------------------- checkout
class CartLine(BaseModel):
    product_id: int | None = None
    barcode: str | None = Field(default=None, max_length=64)
    quantity: int = Field(gt=0, le=10_000)
    # Honoured ONLY for offline replays (the price the customer was actually
    # shown at the till). Online sales always use the server's current price.
    unit_price: Money | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _needs_identifier(self):
        if self.product_id is None and not self.barcode:
            raise ValueError("each item needs a product_id or a barcode")
        return self


class CheckoutRequest(BaseModel):
    items: list[CartLine] = Field(min_length=1, max_length=500)
    client_ref: str | None = Field(default=None, min_length=8, max_length=64)
    # True when replaying a sale that was rung up without a connection:
    # stock is deducted even if it would go below zero, the till's unit
    # prices are kept, and sold_at is used as the sale timestamp.
    offline: bool = False
    sold_at: datetime | None = None
    # Cashier override ("sell anyway") when the system count is wrong but the
    # goods are physically on the shelf. Skips the stock guard, keeps server prices.
    allow_oversell: bool = False


class SaleItemOut(BaseModel):
    product_id: int
    name: str
    quantity_sold: int
    unit_price: Money
    line_total: Money


class StockUpdate(BaseModel):
    product_id: int
    stock_quantity: int
    low_stock_threshold: int
    is_low: bool


class CheckoutResponse(BaseModel):
    sale_id: int
    client_ref: str | None
    total_amount: Money
    net_profit: Money
    item_count: int
    created_at: datetime
    items: list[SaleItemOut]
    stock_updates: list[StockUpdate]
    duplicate: bool = False  # True when this client_ref had already been recorded


# ----------------------------------------------------------------- reports
class DashboardPoint(BaseModel):
    period: str  # YYYY-MM-DD | YYYY-MM | YYYY
    revenue: Money
    net_profit: Money
    units_sold: int
    transactions: int


class DashboardTotals(BaseModel):
    revenue: Money
    net_profit: Money
    units_sold: int
    transactions: int


class DashboardResponse(BaseModel):
    group_by: Literal["day", "month", "year"]
    start: date
    end: date
    totals: DashboardTotals
    series: list[DashboardPoint]
