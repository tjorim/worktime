"""Environment configuration settings for Worktime backend.

This module handles environment variable loading and provides configuration
settings with sensible defaults for development and production environments.
"""

import logging
from pathlib import Path

from pydantic import field_validator
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
    HOLIDAY_CACHE_TTL: int = 86400  # 24 hours — holiday data doesn't change intra-year

    # Database configuration
    DATABASE_URL: str = "postgresql+asyncpg://worktime:worktime@localhost/worktime"
    DATABASE_ECHO: bool = False
    DATABASE_ENABLED: bool = True
    DATABASE_POOL_SIZE: int = 5
    DATABASE_POOL_MAX_OVERFLOW: int = 10

    # HMAC secret for the /api/metrics endpoint.
    # When empty the metrics endpoint returns 404 so it stays invisible to scanners.
    # Generate a suitable value with: python -c "import secrets; print(secrets.token_hex(32))"
    METRICS_HMAC_SECRET: str = ""

    # Sentry error tracking.
    # Leave SENTRY_DSN empty (the default) to disable Sentry entirely.
    # When set, sentry-sdk[fastapi] must be installed: uv add sentry-sdk[fastapi]
    SENTRY_DSN: str = ""
    # Fraction of transactions to send for performance monitoring (0.0 disables it).
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0

    # OIDC authentication configuration
    # OIDC_ISSUER_URL: Base URL of the OIDC provider (e.g. https://auth.example.com/application/o/worktime)
    OIDC_ISSUER_URL: str = "http://localhost:9000/application/o/worktime"
    # OIDC_AUDIENCE: Expected audience claim in the JWT (leave empty to skip audience check)
    OIDC_AUDIENCE: str = ""
    # OIDC_JWKS_URI: JWKS endpoint (defaults to {OIDC_ISSUER_URL}/.well-known/jwks.json when empty)
    OIDC_JWKS_URI: str = ""
    # OIDC_ALGORITHMS: Comma-separated list of accepted signing algorithms
    OIDC_ALGORITHMS: str = "RS256"

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
        logger.info(f"OIDC Issuer:     {self.OIDC_ISSUER_URL}")
        sentry_status = f"enabled (traces_sample_rate={self.SENTRY_TRACES_SAMPLE_RATE})" if self.SENTRY_DSN else "disabled"
        logger.info(f"Sentry:          {sentry_status}")
        logger.info("=" * 60)


# Global settings instance used by the running application.
settings = Settings()
