"""Environment configuration settings for Worktime backend.

This module handles environment variable loading and provides configuration
settings with sensible defaults for development and production environments.
"""

import logging
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All settings have sensible defaults for development convenience.
    In production, override via environment variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow"
    )
    
    # Legacy file-share configuration — set to False when .hday file share is unavailable.
    # Disables share directory checks, cache warming, and the hday/team endpoints.
    LEGACY_FILESHARE_ENABLED: bool = False

    # File storage configuration
    SHARE_DIR: str = "./data/hday_files"
    
    # CORS configuration
    CORS_ORIGINS: str = "http://localhost:5173"
    
    # Environment mode
    ENVIRONMENT: str = "development"
    
    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Cache configuration
    CACHE_TTL: int = 10
    CACHE_ENABLED: bool = True

    # Database configuration
    DATABASE_URL: str = "postgresql+asyncpg://worktime:worktime@localhost/worktime"
    DATABASE_ECHO: bool = False
    DATABASE_ENABLED: bool = True
    DATABASE_POOL_SIZE: int = 5
    DATABASE_POOL_MAX_OVERFLOW: int = 10

    # Comma-separated list of usernames that are granted admin privileges.
    # Example: ADMIN_USERNAMES=jorim,alice
    ADMIN_USERNAMES: str = ""

    # SuperTokens authentication configuration
    SUPERTOKENS_CONNECTION_URI: str = "http://localhost:3567"
    SUPERTOKENS_API_KEY: str = ""
    SUPERTOKENS_API_DOMAIN: str = "http://localhost:8000"
    SUPERTOKENS_WEBSITE_DOMAIN: str = "http://localhost:5173"
    SUPERTOKENS_API_BASE_PATH: str = "/auth"
    SUPERTOKENS_WEBSITE_BASE_PATH: str = "/auth"

    @field_validator("SUPERTOKENS_API_BASE_PATH", "SUPERTOKENS_WEBSITE_BASE_PATH")
    @classmethod
    def validate_supertokens_base_path(cls, v: str) -> str:
        """Validate SuperTokens base paths start with '/' and are non-empty."""
        v = v.strip()
        if not v:
            raise ValueError("Base path cannot be empty")
        if not v.startswith("/"):
            raise ValueError(f"Base path must start with '/', got: {v!r}")
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate DATABASE_URL uses the postgresql+asyncpg async driver."""
        if not v or not v.strip():
            raise ValueError("DATABASE_URL cannot be empty")
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must use the asyncpg driver: postgresql+asyncpg://..."
            )
        return v

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: str) -> str:
        """Validate CORS origins format."""
        if not v or not v.strip():
            raise ValueError("CORS_ORIGINS cannot be empty")
        return v
    
    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Validate environment mode."""
        v = v.lower()
        if v not in ("development", "production"):
            raise ValueError(
                f"ENVIRONMENT must be 'development' or 'production', got: {v}"
            )
        return v
    
    @model_validator(mode="after")
    def validate_production_supertokens_config(self) -> "Settings":
        key = (self.SUPERTOKENS_API_KEY or "").strip()
        self.SUPERTOKENS_API_KEY = key

        if self.ENVIRONMENT == "production" and not key:
            raise ValueError(
                "SUPERTOKENS_API_KEY must be set in production to secure the SuperTokens core"
            )
        return self

    @field_validator("CACHE_TTL")
    @classmethod
    def validate_cache_ttl(cls, v: int) -> int:
        """Validate cache TTL is positive."""
        if v < 0:
            raise ValueError(f"CACHE_TTL must be non-negative, got: {v}")
        return v

    def get_cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS into a list of allowed origins.
        
        Returns:
            List of allowed origins. Returns empty list if wildcard is attempted
            in production (forcing explicit origin configuration for security).
        """
        cors_env = self.CORS_ORIGINS.strip()
        
        # Handle wildcard
        if cors_env == "*":
            # Only allow wildcard in non-production
            if self.ENVIRONMENT == "production":
                logger.warning(
                    "⚠️  CORS_ORIGINS='*' is not allowed in production. "
                    "No origins will be allowed. Set CORS_ORIGINS to explicit origins."
                )
                return []
            logger.info("CORS: Allowing all origins (*) in development mode")
            return ["*"]
        
        # Parse comma-separated origins
        origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
        return origins
    
    def get_share_dir_path(self) -> Path:
        """Get SHARE_DIR as a Path object."""
        return Path(self.SHARE_DIR).resolve()
    
    def ensure_share_dir_exists(self) -> None:
        """Create SHARE_DIR if it doesn't exist (development convenience)."""
        share_path = self.get_share_dir_path()
        try:
            if not share_path.exists():
                logger.info(f"Creating SHARE_DIR: {share_path}")
                share_path.mkdir(parents=True, exist_ok=True)
            else:
                logger.info(f"SHARE_DIR exists: {share_path}")
        except (PermissionError, OSError) as e:
            logger.warning(
                f"Could not create or check SHARE_DIR at {share_path}: {e}. "
                "This is expected in production when using mounted shares with restricted permissions."
            )
    
    def log_configuration(self) -> None:
        """Log configuration state at startup (mask sensitive values)."""
        logger.info("=" * 60)
        logger.info("Worktime Backend Configuration")
        logger.info("=" * 60)
        logger.info(f"Environment:     {self.ENVIRONMENT}")
        logger.info(f"Host:            {self.HOST}")
        logger.info(f"Port:            {self.PORT}")
        logger.info(f"Legacy fileshare: {'enabled' if self.LEGACY_FILESHARE_ENABLED else 'disabled'}")
        if self.LEGACY_FILESHARE_ENABLED:
            logger.info(f"Share Directory: {self.get_share_dir_path()}")
        
        # Log CORS configuration
        cors_origins = self.get_cors_origins_list()
        if not cors_origins:
            logger.error(
                "⚠️  No CORS origins configured - all cross-origin requests will be blocked!"
            )
        else:
            logger.info(f"CORS Origins:    {', '.join(cors_origins)}")
        
        # Log cache configuration
        cache_status = "enabled" if self.CACHE_ENABLED else "disabled"
        logger.info(f"Cache:           {cache_status} (TTL: {self.CACHE_TTL}s)")

        db_status = "enabled" if self.DATABASE_ENABLED else "disabled"
        # Mask credentials from DATABASE_URL before logging.
        try:
            from sqlalchemy.engine.url import make_url
            parsed = make_url(self.DATABASE_URL)
            safe_url = parsed.render_as_string(hide_password=True)
        except Exception:
            safe_url = "<unparseable>"
        logger.info(f"Database:        {db_status} (echo: {self.DATABASE_ECHO}, url: {safe_url})")
        logger.info("=" * 60)


# Global settings instance used by the running application.
settings = Settings()
