"""Health check endpoints.

Provides three endpoints that serve different consumers:

- ``GET /health/liveness`` — instant alive check with no external dependencies.
  Suitable for load-balancer / Kubernetes liveness probes that must never
  make a DB call (a liveness failure restarts the pod).

- ``GET /health/readiness`` — verifies that all required external systems
  (database, auth) are reachable.  A readiness failure stops traffic routing
  without restarting the pod.

- ``GET /health`` — lightweight summary with ``links`` to both sub-endpoints.
"""

import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..config.oidc_config import OIDCTokenError, _resolve_jwks_uri
from ..database.engine import get_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


async def _get_db_if_enabled() -> AsyncGenerator[AsyncSession | None, None]:
    """Yield a DB session when DATABASE_ENABLED, otherwise yield None."""
    if settings.DATABASE_ENABLED:
        async for session in get_session():
            yield session
    else:
        yield None


async def _check_jwks_reachable() -> bool:
    """Check that the OIDC provider's JWKS endpoint is reachable."""
    jwks_uri = await _resolve_jwks_uri()
    async with httpx.AsyncClient(timeout=3.0) as client:
        response = await client.get(jwks_uri)
    if response.status_code == 200:
        return True
    logger.warning("Health check: OIDC provider returned unexpected status %s", response.status_code)
    return False


_JWKS_READINESS_CACHE_SECONDS = 30.0
_jwks_readiness_cache: tuple[float, bool] | None = None
_jwks_readiness_lock = asyncio.Lock()


async def _jwks_reachable() -> bool:
    global _jwks_readiness_cache  # noqa: PLW0603
    now = time.monotonic()
    if _jwks_readiness_cache is not None and now - _jwks_readiness_cache[0] < _JWKS_READINESS_CACHE_SECONDS:
        return _jwks_readiness_cache[1]

    async with _jwks_readiness_lock:
        now = time.monotonic()
        if _jwks_readiness_cache is not None and now - _jwks_readiness_cache[0] < _JWKS_READINESS_CACHE_SECONDS:
            return _jwks_readiness_cache[1]

        reachable = await _check_jwks_reachable()
        _jwks_readiness_cache = (now, True) if reachable else None
        return reachable


@router.get("/health/liveness")
async def liveness() -> JSONResponse:
    """Liveness probe — returns 200 immediately with no external I/O.

    Use this for Kubernetes/load-balancer liveness probes.  A failure here
    indicates the process itself is unresponsive and the pod should be
    restarted.

    Returns:
        JSONResponse: ``{"status": "alive"}`` with HTTP 200.
    """
    return JSONResponse(status_code=status.HTTP_200_OK, content={"status": "alive"})


@router.get("/health/readiness")
async def readiness(
    db: Annotated[AsyncSession | None, Depends(_get_db_if_enabled)],
) -> JSONResponse:
    """Readiness probe — checks that all required dependencies are healthy.

    Checks database connectivity when DATABASE_ENABLED is true,
    OIDC provider reachability always, and share directory
    accessibility when LEGACY_FILESHARE_ENABLED is true.

    Use this for Kubernetes/load-balancer readiness probes.  A failure here
    stops routing new traffic without restarting the pod.

    Returns:
        JSONResponse with health status:
        - 200: ``{"status": "ok", ...}`` — all checked systems operational.
        - 503: ``{"status": "degraded", ...}`` — one or more systems unavailable.
    """
    content: dict = {}

    async def _check_auth() -> tuple[str, bool]:
        """Check that the OIDC provider's JWKS endpoint is reachable."""
        try:
            if await _jwks_reachable():
                return "ok", False
            return "unreachable", True
        except OIDCTokenError as e:
            logger.error("Health check failed: OIDC discovery failed", exc_info=e)
            return "unreachable", True
        except Exception as e:
            logger.error("Health check failed: OIDC provider unreachable", exc_info=e)
            return "unreachable", True

    async def _check_db() -> tuple[str, bool] | None:
        if db is None:
            return None
        try:
            # Use a statement timeout to protect against connection pool exhaustion
            # or hung queries silently blocking the readiness probe.
            await db.execute(text("SET LOCAL statement_timeout = '2s'"))
            await db.execute(text("SELECT 1"))
            return "ok", False
        except Exception as e:
            logger.error("Readiness check failed: database unreachable", exc_info=e)
            return "unreachable", True

    auth_status, db_status = await asyncio.gather(_check_auth(), _check_db())

    content["auth"], auth_degraded = auth_status
    degraded = auth_degraded

    if db_status is not None:
        content["database"], db_degraded = db_status
        degraded = degraded or db_degraded

    if settings.LEGACY_FILESHARE_ENABLED:
        share_path = settings.get_share_dir_path()

        def _probe_share() -> tuple[str, bool, dict]:
            try:
                if not share_path.exists() or not share_path.is_dir():
                    logger.warning(f"Readiness check failed: SHARE_DIR not found: {share_path}")
                    return "not_found", True, {}
                next(share_path.iterdir(), None)
                return "ok", False, {}
            except PermissionError:
                logger.error(f"Readiness check failed: permission denied for SHARE_DIR: {share_path}")
                return "permission_denied", True, {}
            except Exception as e:
                logger.error("Readiness check failed: error accessing SHARE_DIR", exc_info=e)
                return "error", True, {"error": "internal_error"}

        try:
            share_status, share_degraded, share_extra = await asyncio.wait_for(
                asyncio.to_thread(_probe_share), timeout=2
            )
        except TimeoutError:
            logger.error("Readiness check failed: SHARE_DIR probe timed out")
            share_status, share_degraded, share_extra = "error", True, {"error": "internal_error"}

        content["share"] = share_status
        content.update(share_extra)
        degraded = degraded or share_degraded

    content["status"] = "degraded" if degraded else "ok"
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE if degraded else status.HTTP_200_OK,
        content=content,
    )


@router.get("/health")
async def health_summary() -> JSONResponse:
    """Health summary — lightweight overview with links to sub-endpoints.

    Returns a static 200 response with ``links`` to the liveness and readiness
    probes.  Use the individual probe endpoints for actual dependency checks.

    Returns:
        JSONResponse: ``{"status": "ok", "links": {...}}`` with HTTP 200.
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "ok",
            "links": {
                "liveness": "/api/health/liveness",
                "readiness": "/api/health/readiness",
            },
        },
    )
