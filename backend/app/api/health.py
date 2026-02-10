"""Health check endpoint with share directory accessibility verification.

This module provides health check endpoints that actively verify system
components including share directory accessibility.
"""

import logging
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/v1/health")
async def health_check() -> JSONResponse:
    """Health check endpoint with share directory accessibility verification.
    
    This endpoint actively verifies that the share directory is accessible
    by checking if it exists, is a directory, and has read permissions.
    
    Returns:
        JSONResponse with health status:
        - 200: {"status": "ok", "share": "accessible"} - All systems operational
        - 503: {"status": "degraded", "share": "not_found"} - Directory missing
        - 503: {"status": "degraded", "share": "permission_denied"} - Access denied
        - 503: {"status": "degraded", "share": "error", "error": "<msg>"} - Other errors
    """
    share_path = settings.get_share_dir_path()
    
    # Check if directory exists
    if not share_path.exists():
        logger.warning(f"Health check failed: SHARE_DIR does not exist: {share_path}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "share": "not_found"}
        )
    
    # Check if path is a directory
    if not share_path.is_dir():
        logger.warning(f"Health check failed: SHARE_DIR is not a directory: {share_path}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "share": "not_found"}
        )
    
    # Attempt to list directory contents to verify read access
    try:
        list(share_path.iterdir())
        logger.debug(f"Health check passed: SHARE_DIR is accessible: {share_path}")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "ok", "share": "accessible"}
        )
    except PermissionError as e:
        logger.error(f"Health check failed: Permission denied for SHARE_DIR: {share_path}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "share": "permission_denied"}
        )
    except Exception as e:
        logger.error("Health check failed: Error accessing SHARE_DIR", exc_info=e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "share": "error", "error": "internal_error"}
        )


@router.get("/healthz")
async def healthz_alias() -> JSONResponse:
    """Kubernetes-compatible health check alias.
    
    This endpoint is an alias for /v1/health to support Kubernetes
    health check conventions.
    
    Returns:
        Same as /v1/health endpoint
    """
    return await health_check()
