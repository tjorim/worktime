"""Environment configuration settings for Worktime backend.

This module handles environment variable loading and provides configuration
settings with sensible defaults for development and production environments.
"""

import logging
from pathlib import Path
from urllib.parse import quote

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All settings have sensible defaults for development convenience.
    In production, override via environment variables.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="allow")

    # CORS configuration
    CORS_ORIGINS: str = "http://localhost:5173"

    # Trusted hosts for Host-header validation (TrustedHostMiddleware).
    # Comma-separated hostnames, e.g. "worktime.tjor.im". "*" (the development
    # default) disables validation — production should set this explicitly.
    TRUSTED_HOSTS: str = "*"

    # Environment mode
    ENVIRONMENT: str = "development"

    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Cache configuration
    CACHE_TTL: int = 10
    CACHE_ENABLED: bool = True
    HOLIDAY_CACHE_TTL: int = 86400  # 24 hours — holiday data doesn't change intra-year

    # Database configuration.
    # DATABASE_URL is a full-URL override kept for local dev convenience. When
    # unset (the default), the URL is built from DB_HOST/DB_PORT/DB_NAME/DB_USER
    # + the resolved password below — the preferred production pattern, since
    # DB_PASSWORD_FILE keeps the actual secret out of the plaintext env file.
    DATABASE_URL: str = ""
    DATABASE_ECHO: bool = False
    DATABASE_ENABLED: bool = True
    DATABASE_POOL_SIZE: int = 5
    DATABASE_POOL_MAX_OVERFLOW: int = 10

    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "worktime"
    DB_USER: str = "worktime"
    # DB_PASSWORD is a local-dev convenience default (matches docker-compose.yml).
    # Production should use DB_PASSWORD_FILE to point at a Docker secret instead.
    DB_PASSWORD: str = "worktime"
    DB_PASSWORD_FILE: str = ""

    # HMAC secret for the /api/metrics endpoint.
    # When empty the metrics endpoint returns 404 so it stays invisible to scanners.
    # Generate a suitable value with: python -c "import secrets; print(secrets.token_hex(32))"
    METRICS_HMAC_SECRET: str = ""

    # HMAC secret used to hash managed integration-client keys (app.services
    # .integration_client_service) before they're stored in the database. The
    # raw key is server-generated with high entropy (secrets.token_urlsafe),
    # not a user password, so HMAC-SHA256 with a server-side secret is
    # correct here: it adds defense-in-depth against a stolen database dump
    # (without the secret, a leaked key_hash can't be replayed even though
    # brute-forcing the raw key is already infeasible at this entropy).
    # Falls back to a fixed local-dev-only value when unset; production must
    # set a real secret — see validate_production_integration_key_hash_secret.
    # Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
    INTEGRATION_KEY_HASH_SECRET: str = ""
    INTEGRATION_KEY_HASH_SECRET_PREVIOUS: str = ""

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
    # OIDC_JWKS_URI: optional JWKS endpoint override; discovered from OIDC metadata when empty
    OIDC_JWKS_URI: str = ""
    # OIDC_ALGORITHMS: Comma-separated list of accepted signing algorithms
    OIDC_ALGORITHMS: str = "RS256"

    # DEV_AUTH_BYPASS_TOKEN: local-dev-only shortcut that skips real OIDC/JWKS
    # verification entirely — no Keycloak/IdP container needed. When set, a
    # request bearing this exact string as its Bearer token is treated as a
    # fixed dev user (see oidc_config._DEV_BYPASS_CLAIMS). Empty by default;
    # validate_production_no_dev_bypass() refuses to start if this is ever
    # set outside ENVIRONMENT=development.
    DEV_AUTH_BYPASS_TOKEN: str = ""

    # Per-client-IP rate limiting (slowapi). RATE_LIMIT_DEFAULT applies to every
    # /api route unless explicitly exempted (e.g. health probes).
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "200/minute"

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate DATABASE_URL uses an async driver, if set.

        postgresql+asyncpg:// is the production driver. sqlite+aiosqlite:// is
        accepted too, purely as a local-dev convenience so contributors can run
        the backend without a Postgres container; nothing else about the app
        depends on which one is in use.
        """
        if v and not v.startswith(("postgresql+asyncpg://", "sqlite+aiosqlite://")):
            raise ValueError(
                "DATABASE_URL must use an async driver: postgresql+asyncpg://... "
                "(production) or sqlite+aiosqlite://... (local dev only)"
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
            raise ValueError(f"ENVIRONMENT must be 'development' or 'production', got: {v}")
        return v

    @field_validator("CACHE_TTL")
    @classmethod
    def validate_cache_ttl(cls, v: int) -> int:
        """Validate cache TTL is positive."""
        if v < 0:
            raise ValueError(f"CACHE_TTL must be non-negative, got: {v}")
        return v

    @model_validator(mode="after")
    def validate_production_trusted_hosts(self) -> "Settings":
        """Refuse to start in production without a real TRUSTED_HOSTS allowlist.

        A silently-wildcarded Host header check is worse than no deployment at
        all, so this fails startup the same way champagnefestival and daynest
        require their production-critical settings, instead of only logging
        a warning and leaving Host validation disabled. Checks the *parsed*
        value rather than the raw string: a separator-only value like ","
        passes a raw non-empty check but parses down to zero real hostnames,
        which would otherwise silently lock out all production traffic once
        TrustedHostMiddleware is wired up with an effectively empty allowlist.
        """
        if self.ENVIRONMENT == "production" and self._parse_trusted_hosts() == ["*"]:
            raise ValueError("TRUSTED_HOSTS must be set to a real hostname allowlist in production.")
        return self

    @model_validator(mode="after")
    def validate_production_no_dev_bypass(self) -> "Settings":
        """Refuse to start with DEV_AUTH_BYPASS_TOKEN set outside development.

        This makes it structurally impossible for the auth bypass to be both
        configured and reachable in production at the same time — belt and
        suspenders alongside decode_token() itself never checking it unless
        it's non-empty.
        """
        if self.DEV_AUTH_BYPASS_TOKEN and self.ENVIRONMENT != "development":
            raise ValueError("DEV_AUTH_BYPASS_TOKEN must not be set outside ENVIRONMENT=development.")
        return self

    @model_validator(mode="after")
    def validate_production_integration_key_hash_secret(self) -> "Settings":
        """Refuse to start in production without a real integration-key hash secret.

        The unset default is safe only for local dev (single-operator,
        low-value threat model); production must set an explicit secret so a
        database dump alone can't be used to forge/replay integration-client
        keys, matching the pattern already established for TRUSTED_HOSTS and
        DEV_AUTH_BYPASS_TOKEN above.
        """
        if self.ENVIRONMENT == "production" and not self.INTEGRATION_KEY_HASH_SECRET.strip():
            raise ValueError("INTEGRATION_KEY_HASH_SECRET must be set to a real secret in production.")
        return self

    def resolved_integration_key_hash_secret(self) -> str:
        """Resolve the HMAC secret for hashing integration-client keys.

        Falls back to a fixed local-dev-only value when unset. Production
        cannot reach this fallback: validate_production_integration_key_hash_secret
        refuses to start without an explicit value first.

        Deployment note: changing the effective secret (via env or fallback)
        invalidates all previously stored ``integration_clients.key_hash`` values;
        existing clients will fail to authenticate until rotated. Rotate all
        integration clients when rotating this secret.
        """
        return self.INTEGRATION_KEY_HASH_SECRET.strip() or "worktime-dev-integration-key-hash-secret"

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

    def _parse_trusted_hosts(self) -> list[str]:
        """Parse the raw TRUSTED_HOSTS value into real hostnames.

        Returns ["*"] when unset, wildcarded, or when the comma-separated
        value parses down to zero real hostnames (e.g. a separator-only value
        like ",") — all three mean "no allowlist configured".
        """
        trusted = self.TRUSTED_HOSTS.strip()
        if not trusted or trusted == "*":
            return ["*"]
        hosts = [host.strip() for host in trusted.split(",") if host.strip()]
        return hosts or ["*"]

    def get_trusted_hosts_list(self) -> list[str]:
        """Parse TRUSTED_HOSTS into the effective allowlist for TrustedHostMiddleware.

        Returns:
            List of allowed hostnames. Falls back to ["*"] (no restriction) when
            empty, wildcarded, or unparseable — only reachable in development,
            since validate_production_trusted_hosts() refuses to start in
            production with such a value. Otherwise always includes
            "localhost": Docker's own HEALTHCHECK curls
            http://localhost:PORT/health from inside the container, and that
            must keep working regardless of the configured production
            allowlist.
        """
        hosts = self._parse_trusted_hosts()
        if hosts != ["*"] and "localhost" not in hosts:
            hosts = [*hosts, "localhost"]
        return hosts

    def resolved_db_password(self) -> str:
        """Resolve the database password, preferring DB_PASSWORD_FILE when set.

        DB_PASSWORD_FILE is expected to point at a Docker/Compose secret file
        containing just the password, so the real value never has to sit in a
        plaintext env file.
        """
        if self.DB_PASSWORD_FILE:
            try:
                return Path(self.DB_PASSWORD_FILE).read_text(encoding="utf-8").strip()
            except OSError as e:
                raise ValueError(f"Could not read DB_PASSWORD_FILE at {self.DB_PASSWORD_FILE}: {e}") from e
        return self.DB_PASSWORD

    def resolved_database_url(self) -> str:
        """Return the effective database URL.

        DATABASE_URL, when set, is used verbatim (local dev convenience — matches
        docker-compose.yml). Otherwise the URL is built from DB_HOST/DB_PORT/
        DB_NAME/DB_USER plus the resolved password, which is the preferred
        pattern in production since it keeps the password out of the plaintext
        env file via DB_PASSWORD_FILE.
        """
        if self.DATABASE_URL:
            return self.DATABASE_URL
        user = quote(self.DB_USER, safe="")
        password = quote(self.resolved_db_password(), safe="")
        host = self.DB_HOST
        if ":" in host and not host.startswith("["):
            # Bracket IPv6 literals (e.g. "::1") — otherwise the host can't be
            # told apart from the following ":<port>" in the URL authority.
            host = f"[{host}]"
        return f"postgresql+asyncpg://{user}:{password}@{host}:{self.DB_PORT}/{self.DB_NAME}"

    def log_configuration(self) -> None:
        """Log configuration state at startup (mask sensitive values)."""
        logger.info("=" * 60)
        logger.info("Worktime Backend Configuration")
        logger.info("=" * 60)
        logger.info(f"Environment:     {self.ENVIRONMENT}")
        logger.info(f"Host:            {self.HOST}")
        logger.info(f"Port:            {self.PORT}")

        # Log CORS configuration
        cors_origins = self.get_cors_origins_list()
        if not cors_origins:
            logger.error("⚠️  No CORS origins configured - all cross-origin requests will be blocked!")
        else:
            logger.info(f"CORS Origins:    {', '.join(cors_origins)}")

        # Log trusted hosts configuration. Deliberately not logging the
        # configured value itself: CodeQL's clear-text-logging query treats
        # TRUSTED_HOSTS as a sensitive name (substring match on "TRUST",
        # likely inherited from Java's truststore/keystore naming
        # conventions) even though a hostname allowlist isn't actually
        # secret. Logging only a status avoids that false positive.
        if self.TRUSTED_HOSTS.strip() in ("", "*"):
            logger.info("Trusted Hosts:   * (Host header validation disabled)")
        else:
            logger.info("Trusted Hosts:   configured (Host header validation enabled)")

        # Log cache configuration
        cache_status = "enabled" if self.CACHE_ENABLED else "disabled"
        logger.info(f"Cache:           {cache_status} (TTL: {self.CACHE_TTL}s)")

        db_status = "enabled" if self.DATABASE_ENABLED else "disabled"
        # Deliberately not logging any form of the database URL/host, even
        # redacted — DB_HOST/DB_PORT/DB_NAME/DB_USER are logged individually
        # below, but never anything derived from DB_PASSWORD/DB_PASSWORD_FILE.
        logger.info(f"Database:        {db_status} (echo: {self.DATABASE_ECHO})")
        if self.DATABASE_ENABLED and not self.DATABASE_URL:
            logger.info(f"  DB Host:       {self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME} (user: {self.DB_USER})")
        logger.info(f"OIDC Issuer:     {self.OIDC_ISSUER_URL}")
        sentry_status = (
            f"enabled (traces_sample_rate={self.SENTRY_TRACES_SAMPLE_RATE})" if self.SENTRY_DSN else "disabled"
        )
        logger.info(f"Sentry:          {sentry_status}")
        logger.info("=" * 60)


# Global settings instance used by the running application.
settings = Settings()
