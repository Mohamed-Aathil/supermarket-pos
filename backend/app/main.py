from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from .config import get_settings
from .database import engine
from .models import Base
from .routers import checkout, products, reports

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # create_all never alters existing tables: add columns introduced later.
            await conn.execute(
                text("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)")
            )
    yield
    await engine.dispose()


app = FastAPI(title="Supermarket POS API", version="1.0.0", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(products.router, prefix=API_PREFIX)
app.include_router(checkout.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)


@app.get("/health", tags=["meta"])
async def health():
    """Used by the frontend to tell 'server reachable' from 'browser says online'."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}
