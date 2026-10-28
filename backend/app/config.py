from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://pos:pos@localhost:5432/pos"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    timezone: str = "Asia/Kolkata"
    auto_create_tables: bool = True

    @field_validator("timezone")
    @classmethod
    def _valid_timezone(cls, v: str) -> str:
        # Fails fast on typos. The value is later inlined into SQL, so only
        # real IANA keys (letters, digits, "/", "_", "+", "-") may pass.
        ZoneInfo(v)
        return v

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
