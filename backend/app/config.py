"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Helm"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False

    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "helm"
    postgres_password: str = ""
    postgres_db: str = "helm"

    @computed_field
    @property
    def database_url(self) -> str:
        """Construct async database URL."""
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @computed_field
    @property
    def database_url_sync(self) -> str:
        """Construct sync database URL (for Alembic)."""
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Auth / JWT
    jwt_secret_key: str  # Required - no default, must be set in .env
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Google OAuth
    google_client_id: str  # Required - get from Google Cloud Console

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
