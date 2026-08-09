"""CORS configuration module with production safety checks.

This module provides CORS origin validation and parsing functionality
with built-in security for production environments.
"""

import logging

logger = logging.getLogger(__name__)


def get_cors_origins(cors_env: str, environment: str) -> list[str]:
    """Parse and validate CORS origins with production safety checks.

    Args:
        cors_env: CORS_ORIGINS environment variable value
        environment: Current environment mode (development/production)

    Returns:
        List of allowed origins. Returns empty list if wildcard is attempted
        in production (forcing explicit origin configuration for security).
        Falls back to http://localhost:5173 if parsing fails.

    Production Safety:
        - Wildcard (*) is rejected in production/prod environments
        - Logs warning when wildcard is blocked
        - Requires explicit origin configuration for production
    """
    cors_value = cors_env.strip()
    env_lower = environment.lower()

    # Production safety check for wildcard
    if cors_value == "*":
        if env_lower in ("production", "prod"):
            logger.warning(
                "⚠️  CORS_ORIGINS='*' is not allowed in production. "
                "No origins will be allowed. Set CORS_ORIGINS to explicit origins."
            )
            return []
        logger.info("CORS: Allowing all origins (*) in development mode")
        return ["*"]

    # Parse comma-separated origins
    origins = [origin.strip() for origin in cors_value.split(",") if origin.strip()]

    # Fallback to localhost if no valid origins
    if not origins:
        logger.warning("No valid CORS origins parsed. Falling back to http://localhost:5173")
        return ["http://localhost:5173"]

    return origins
