"""Health check endpoint."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
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


@router.get("/health")
async def health_check(
    db: Annotated[AsyncSession | None, Depends(_get_db_if_enabled)],
) -> JSONResponse:
    """Health check endpoint.

    Checks database connectivity when DATABASE_ENABLED is true,
    SuperTokens core reachability always, and share directory
    accessibility when LEGACY_FILESHARE_ENABLED is true.

    Returns:
        JSONResponse with health status:
        - 200: {"status": "ok", ...} - All checked systems operational
        - 503: {"status": "degraded", ...} - One or more systems unavailable
    """
    content: dict = {}

    async def _check_auth() -> tuple[str, bool]:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{settings.SUPERTOKENS_CONNECTION_URI}/hello")
            if response.status_code == 200:
                return "ok", False
            logger.warning("Health check: SuperTokens returned unexpected status %s", response.status_code)
            return "unreachable", True
        except Exception as e:
            logger.error("Health check failed: SuperTokens core unreachable", exc_info=e)
            return "unreachable", True

    async def _check_db() -> tuple[str, bool] | None:
        if db is None:
            return None
        try:
            await db.execute(text("SELECT 1"))
            return "ok", False
        except Exception as e:
            logger.error("Health check failed: database unreachable", exc_info=e)
            return "unreachable", True

    auth_status, db_status = await asyncio.gather(_check_auth(), _check_db())

    content["auth"], auth_degraded = auth_status
    degraded = auth_degraded

    if db_status is not None:
        content["database"], db_degraded = db_status
        degraded = degraded or db_degraded

    if settings.LEGACY_FILESHARE_ENABLED:
        share_path = settings.get_share_dir_path()
        try:
            if not share_path.exists() or not share_path.is_dir():
                logger.warning(f"Health check failed: SHARE_DIR not found: {share_path}")
                content["share"] = "not_found"
                degraded = True
            else:
                next(share_path.iterdir(), None)
                content["share"] = "ok"
        except PermissionError:
            logger.error(f"Health check failed: permission denied for SHARE_DIR: {share_path}")
            content["share"] = "permission_denied"
            degraded = True
        except Exception as e:
            logger.error("Health check failed: error accessing SHARE_DIR", exc_info=e)
            content["share"] = "error"
            content["error"] = "internal_error"
            degraded = True

    content["status"] = "degraded" if degraded else "ok"
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE if degraded else status.HTTP_200_OK,
        content=content,
    )
