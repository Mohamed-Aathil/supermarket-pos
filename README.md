# Supermarket POS & Inventory

FastAPI + PostgreSQL backend, React (Vite) frontend. Built to keep selling when the internet drops.

## Run it

```bash
# 1. Database
docker compose up -d

# 2. Backend  (Python 3.12)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed --with-sales        # demo products + 14 days of sales (optional)
uvicorn app.main:app --reload          # http://localhost:8000/docs

# 3. Frontend  (new terminal)
cd frontend
npm install
npm run dev                            # http://localhost:5173
```

For the offline app-shell cache (reload while offline), use a production build:
`npm run build && npm run preview`.

## Layout

```
backend/app
  models.py            products, sales, sale_items
  schemas.py           Pydantic request/response models
  routers/products.py  async CRUD + barcode lookup
  routers/checkout.py  POST /api/v1/checkout
  routers/reports.py   GET  /api/v1/reports/dashboard?group_by=day|month|year
  main.py  config.py  database.py  seed.py
frontend/src
  lib/        api.js (fetch + error typing), db.js (Dexie), sync.js (offline queue), format.js, beep.js
  store/      useCartStore.js (cart + queue actions), useCatalogStore.js (products, IndexedDB mirror)
  hooks/      useBarcodeScanner.js, useOfflineSync.js
  components/ POSTerminal, ProductGrid, Cart, RollingNumber, Dashboard, LowStockTable
```

## How the important parts work

**Checkout (atomic + idempotent).** One transaction: each product is updated with
`UPDATE ... SET stock = stock - :qty WHERE id = :id AND stock >= :qty RETURNING price, cost`,
in ascending id order (no deadlocks, no overselling when two tills sell the last item). Prices and
cost come from the database, never the client. If any line is short, the whole sale rolls back
with a 409 listing the products. `client_ref` (a UUID made by the till) is unique, so retrying a
sale returns the original instead of selling twice.

**Offline.** If the server can't be reached, the finished sale is written to IndexedDB with its
`client_ref` and the till carries on (stock is also reduced locally). Queued sales are pushed on
the browser `online` event, on startup, and every 15 s while any are waiting. Replays are sent with
`offline: true`, which keeps the price the customer was shown, records the original sale time, and
never rejects for stock (the goods already left the shelf - the count just goes red). A sale the
server rejects for good (e.g. product deleted) is marked *failed* and surfaced in the header with
Retry / Discard instead of blocking the queue.

**Barcode scanner.** A window-level capture-phase `keydown` listener buffers keystrokes; a gap over
80 ms means a human is typing and resets the buffer. A burst of 4+ characters ending in Enter is a
scan. If your scanner is slower, raise `maxGapMs` in `useBarcodeScanner.js`.

**Dashboard.** `/reports/dashboard` buckets sales in the shop's timezone (`TIMEZONE` in `.env`),
fills empty periods with zeros, and aggregates `sales` and `sale_items` in separate queries
(joining them first would multiply revenue by the number of lines per sale).

## Notes

- Low stock means `stock_quantity < low_stock_threshold` (strictly below).
- Tables are created on startup (`AUTO_CREATE_TABLES`). Add Alembic before changing the schema in production.
- There is no login. Put the app behind your shop network / a reverse proxy with auth before exposing it.
- Product photos: set `image_url` on a product (POST/PATCH `/api/v1/products`). Products without one get an automatic emoji tile chosen from the name/category.
- There is no product-management screen yet; add products with the API docs at `/docs`.
