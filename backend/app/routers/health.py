"""Health check endpoint."""

import logging

import httpx
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from ..config import settings
from ..database.engine import get_session_factory

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check() -> JSONResponse:
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
    degraded = False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.SUPERTOKENS_CONNECTION_URI}/hello")
        if response.status_code == 200:
            content["auth"] = "ok"
        else:
            logger.warning("Health check: SuperTokens returned unexpected status %s", response.status_code)
            content["auth"] = "unreachable"
            degraded = True
    except Exception as e:
        logger.error("Health check failed: SuperTokens core unreachable", exc_info=e)
        content["auth"] = "unreachable"
        degraded = True

    if settings.DATABASE_ENABLED:
        try:
            async with get_session_factory()() as session:
                await session.execute(text("SELECT 1"))
            content["database"] = "ok"
        except Exception as e:
            logger.error("Health check failed: database unreachable", exc_info=e)
            content["database"] = "unreachable"
            degraded = True

    if settings.LEGACY_FILESHARE_ENABLED:
        share_path = settings.get_share_dir_path()
        try:
            if not share_path.exists() or not share_path.is_dir():
                logger.warning(f"Health check failed: SHARE_DIR not found: {share_path}")
                content["share"] = "not_found"
                degraded = True
            else:
                list(share_path.iterdir())
                content["share"] = "ok"
        except PermissionError:
            logger.error(f"Health check failed: permission denied for SHARE_DIR: {share_path}")
            content["share"] = "permission_denied"
            degraded = True
        except Exception as e:
            logger.error("Health check failed: error accessing SHARE_DIR", exc_info=e)
            content["share"] = "error"
            degraded = True

    content["status"] = "degraded" if degraded else "ok"
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE if degraded else status.HTTP_200_OK,
        content=content,
    )

