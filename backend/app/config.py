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
    # If database_url_override is set (e.g., for Neon with SSL), it takes precedence
    database_url_override: str | None = None
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "helm"
    postgres_password: str = ""
    postgres_db: str = "helm"

    @computed_field
    @property
    def database_url(self) -> str:
        """Get async database URL. Uses override if provided, otherwise constructs from parts."""
        if self.database_url_override:
            # Replace postgresql:// with postgresql+asyncpg:// for async driver
            url = self.database_url_override
            if url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            return url
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @computed_field
    @property
    def database_url_sync(self) -> str:
        """Get sync database URL (for Alembic). Uses override if provided, otherwise constructs from parts."""
        if self.database_url_override:
            # Ensure we use the sync postgresql:// scheme
            url = self.database_url_override
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            elif url.startswith("postgresql+asyncpg://"):
                url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
            return url
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Auth / JWT
    jwt_secret_key: str  # Required - no default, must be set in .env
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Google OAuth
    google_client_id: str  # Required - get from Google Cloud Console

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # Cookies
    # Set to true when frontend and backend are on different domains (e.g., Vercel + Render)
    # This uses samesite="none" + secure=True instead of samesite="lax"
    cookie_cross_domain: bool = False


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
