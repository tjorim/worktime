"""Worktime Backend API - Main application entry point.

This FastAPI application provides database-backed Worktime features over
PostgreSQL.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastmcp.utilities.lifespan import combine_lifespans
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import settings
from .config.cors import get_cors_origins
from .database import init_db
from .middleware.rate_limit import handle_rate_limit_exceeded, limiter
from .middleware.request_id import RequestIdMiddleware
from .middleware.timing import TimingMiddleware
from .routers.auth import router as auth_router
from .routers.health import router as health_router
from .routers.holidays import router as holidays_router
from .routers.metrics import router as metrics_router
from .utils.sse_manager import sync_event_manager
from .version import APP_VERSION

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

_worktime_mcp_base_url = os.environ.get("WORKTIME_MCP_BASE_URL", "")
if _worktime_mcp_base_url:
    from .mcp_server import MCP_TOOL_CAPABILITIES as _MCP_TOOL_CAPABILITIES
    from .mcp_server import create_mcp_http_app as _create_mcp_http_app

    _mcp, _mcp_app = _create_mcp_http_app(path="/", stateless_http=True)
else:
    from .mcp_server import MCP_TOOL_CAPABILITIES as _MCP_TOOL_CAPABILITIES

    _mcp = None
    _mcp_app = None

# Initialize Sentry error tracking when SENTRY_DSN is configured.
# sentry-sdk[fastapi] must be installed separately: uv add sentry-sdk[fastapi]
if settings.SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            send_default_pii=False,
        )
        logger.info("✓ Sentry error tracking initialized")
    except ImportError:
        logger.warning(
            "⚠️  SENTRY_DSN is configured but sentry-sdk is not installed. Install it with: uv add sentry-sdk[fastapi]"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown events."""
    # Startup
    logger.info("=" * 60)
    logger.info("Worktime Backend API - Starting up")
    logger.info("=" * 60)

    # Log configuration
    settings.log_configuration()

    # Initialize database before accepting connections
    if settings.DATABASE_ENABLED:
        try:
            init_db()
            logger.info("✓ Database initialized")
        except Exception as e:
            logger.error(f"❌ Database initialization failed: {e}")
            raise

        # Start Postgres LISTEN/NOTIFY for cross-process SSE broadcast
        await sync_event_manager.start_pg_listener(settings.resolved_database_url())
    else:
        logger.info("Database initialization skipped (DATABASE_ENABLED=false)")

    # Periodically force-refresh the OIDC JWKS cache so a provider-side key
    # rotation that reuses the same `kid`, or a JWKS URI change, is picked up
    # without a backend restart (the reactive refresh-on-miss path alone
    # can't detect either case).
    jwks_refresh_task = None
    if settings.OIDC_ISSUER_URL:
        from .config.oidc_config import start_periodic_jwks_refresh

        jwks_refresh_task = start_periodic_jwks_refresh()
        logger.info("✓ Periodic OIDC JWKS refresh started in background")

    # Shift-reminder Web Push: opt-in via VAPID keys, so most deployments
    # (and every test run) never start this loop at all.
    shift_reminder_task = None
    if settings.DATABASE_ENABLED and settings.push_notifications_enabled:
        from .services.shift_reminder_scheduler import start_periodic_shift_reminders

        shift_reminder_task = start_periodic_shift_reminders()
        logger.info("✓ Periodic shift-reminder push notifications started in background")

    logger.info("=" * 60)
    logger.info("Startup complete - Server ready to accept connections")
    logger.info("=" * 60)

    yield

    # Shutdown
    logger.info("Worktime Backend API shutting down...")
    if jwks_refresh_task is not None:
        jwks_refresh_task.cancel()
        with suppress(asyncio.CancelledError):
            await jwks_refresh_task
    if shift_reminder_task is not None:
        shift_reminder_task.cancel()
        with suppress(asyncio.CancelledError):
            await shift_reminder_task
    if settings.DATABASE_ENABLED:
        await sync_event_manager.stop_pg_listener()


_lifespan = combine_lifespans(lifespan, _mcp_app.lifespan) if _mcp_app is not None else lifespan

# Create FastAPI application
app = FastAPI(
    title="Worktime Backend API",
    description="API server for Worktime shift tracker and time-off management",
    version=APP_VERSION,
    lifespan=_lifespan,
)

# Configure CORS middleware with production safety
cors_origins = get_cors_origins(settings.CORS_ORIGINS, settings.ENVIRONMENT)

if not cors_origins:
    logger.error(
        "⚠️  No CORS origins configured - all cross-origin requests will be blocked! "
        "Set CORS_ORIGINS environment variable."
    )
else:
    logger.info(f"CORS middleware configured with origins: {cors_origins}")

_cors_kwargs: dict[str, Any] = {
    "allow_origins": cors_origins,
    "allow_credentials": "*" not in cors_origins,
    "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Request-ID"],
    "expose_headers": ["X-Request-ID", "X-Total-Ms"],
}
if _mcp_app is not None:

    class _MCPAwareCORSMiddleware:
        def __init__(self, app, **kwargs) -> None:
            self._app = app
            self._cors = CORSMiddleware(app, **kwargs)

        async def __call__(self, scope, receive, send) -> None:
            if scope.get("type") == "http" and scope.get("path", "").startswith("/mcp"):
                await self._app(scope, receive, send)
            else:
                await self._cors(scope, receive, send)

    app.add_middleware(_MCPAwareCORSMiddleware, **_cors_kwargs)
else:
    app.add_middleware(CORSMiddleware, **_cors_kwargs)

# Per-client-IP rate limiting. `limiter.enabled` (RATE_LIMIT_ENABLED) gates
# actual enforcement; the middleware is always registered so a 429 still gets
# a request ID, timing header, and access-log entry like any other response.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, handle_rate_limit_exceeded)
app.add_middleware(SlowAPIMiddleware)
if settings.RATE_LIMIT_ENABLED:
    logger.info(f"✓ Rate limiting enabled ({settings.RATE_LIMIT_DEFAULT} per client IP)")
else:
    logger.info("Rate limiting disabled (RATE_LIMIT_ENABLED=false)")

# TimingMiddleware records metrics and sets X-Total-Ms.
app.add_middleware(TimingMiddleware)
# RequestIdMiddleware sets/echoes X-Request-ID and emits structured access logs
# after every response, with user_id included for authenticated requests.
app.add_middleware(RequestIdMiddleware)

# TrustedHostMiddleware is outermost: it rejects requests with an unrecognized
# Host header before any other middleware runs. TRUSTED_HOSTS="*" (development
# default) disables validation; production should set explicit hostnames.
trusted_hosts = settings.get_trusted_hosts_list()
app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

# Register API routers — all backend routes are served under /api
app.include_router(auth_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(holidays_router, prefix="/api")

if settings.DATABASE_ENABLED:
    from .routers.access_tokens import router as access_tokens_router
    from .routers.account_router import router as account_router
    from .routers.audit import router as audit_router
    from .routers.db_gantt import router as db_gantt_router
    from .routers.db_preferences import router as db_preferences_router
    from .routers.db_sync import router as db_sync_router
    from .routers.db_time_off import router as db_time_off_router
    from .routers.db_time_tracking import router as db_time_tracking_router
    from .routers.db_users import router as db_users_router
    from .routers.db_work_locations import router as db_work_locations_router
    from .routers.integration_clients import router as integration_clients_router
    from .routers.pebble import router as pebble_router
    from .routers.push import router as push_router
    from .routers.read_models import router as read_models_router
    from .routers.registration import router as registration_router

    app.include_router(account_router, prefix="/api")
    app.include_router(access_tokens_router, prefix="/api")
    app.include_router(integration_clients_router, prefix="/api")
    app.include_router(audit_router, prefix="/api")
    app.include_router(registration_router, prefix="/api")
    app.include_router(db_users_router, prefix="/api")
    app.include_router(db_time_tracking_router, prefix="/api")
    app.include_router(db_work_locations_router, prefix="/api")
    app.include_router(db_gantt_router, prefix="/api")
    app.include_router(db_sync_router, prefix="/api")
    app.include_router(db_preferences_router, prefix="/api")
    app.include_router(read_models_router, prefix="/api")
    app.include_router(pebble_router, prefix="/api")
    app.include_router(db_time_off_router, prefix="/api")
    app.include_router(push_router, prefix="/api")
    logger.info("✓ Database API endpoints enabled")
else:
    logger.info("Database API endpoint registration skipped (DATABASE_ENABLED=false)")

if _mcp_app is not None:
    app.mount("/mcp", _mcp_app)
    logger.info("✓ MCP server mounted at /mcp")


@app.get("/api/mcp/capabilities", tags=["Info"])
async def mcp_capabilities() -> dict[str, object]:
    """Authoritative MCP capability manifest (issue #1054).

    Sourced directly from ``app.mcp_server.MCP_TOOL_CAPABILITIES`` — the same
    dict ``create_mcp_server()`` iterates to register tools — so this
    response cannot drift from what's actually registered on the running
    server. ``tools`` is empty when the MCP server isn't mounted
    (``WORKTIME_MCP_BASE_URL`` unset).
    """
    enabled = _mcp_app is not None
    return {
        "enabled": enabled,
        "mount_path": "/mcp",
        "version": _mcp.version if _mcp is not None else None,
        "tools": [
            {
                "name": name,
                "effect": capability.effect.value,
                "required_tier": capability.required_tier,
            }
            for name, capability in sorted(_MCP_TOOL_CAPABILITIES.items())
        ]
        if enabled
        else [],
        "resources": [],
        "prompts": [],
    }


@app.get("/", response_class=PlainTextResponse, tags=["Info"])
async def root():
    """Root endpoint with basic API information.

    Returns:
        Plain text message with API title and version.
    """
    return f"{app.title} v{app.version}"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
        log_level="info",
    )
