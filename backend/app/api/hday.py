"""REST API endpoints for .hday file CRUD operations.

This module provides HTTP endpoints for reading and writing .hday files
with proper error handling, response formatting, and audit logging.
"""

import logging
from typing import List

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from app.audit import logger as audit
from app.models.hday import (
    HdayConflictResponse,
    HdayEvent,
    HdayReadResponse,
    HdayWriteRequest,
    HdayWriteResponse,
)
from app.services import hday_parser, hday_service
from app.services.hday_service import (
    HdayConflictError,
    HdayFileNotFoundError,
    ShareNotAccessibleError,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Hday Files"])


@router.get("/v1/hday/{username}")
async def get_hday_file(username: str) -> HdayReadResponse:
    """Get a user's .hday file content.
    
    Retrieves the raw content and etag for conflict detection.
    
    Args:
        username: The username whose .hday file to retrieve
        
    Returns:
        HdayReadResponse with username, raw content, and etag
        
    Raises:
        404: File not found for user
        503: Share directory not accessible
    """
    try:
        raw, etag = hday_service.read_hday_file(username)
        logger.info(f"Successfully read .hday file for user: {username}")
        
        return HdayReadResponse(
            username=username,
            raw=raw,
            etag=etag
        )
        
    except HdayFileNotFoundError:
        logger.info(f"File not found for user: {username}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No events found for user: {username}"
        )
        
    except (ShareNotAccessibleError, PermissionError) as e:
        logger.error(f"Share directory not accessible: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Share directory not accessible"}
        )


@router.put("/v1/hday/{username}")
async def put_hday_file(username: str, request: HdayWriteRequest) -> HdayWriteResponse:
    """Create or update a user's .hday file.
    
    Accepts either raw .hday content or a list of events to serialize.
    If both are provided, events takes precedence.
    
    Args:
        username: The username whose .hday file to write
        request: Write request with optional raw/events and etag
        
    Returns:
        HdayWriteResponse with new etag
        
    Raises:
        422: Neither raw nor events provided
        409: Conflict - file state doesn't match expected etag
        503: Share directory not accessible
    """
    # Validation: at least one of raw or events must be provided
    if request.raw is None and request.events is None:
        logger.warning(f"PUT request for {username} with neither raw nor events")
        raise HTTPException(
            status_code=422,
            detail="Either 'raw' or 'events' must be provided"
        )
    
    # Content resolution logic
    # If both raw and events provided, events takes precedence
    if request.events is not None:
        content = hday_parser.to_text(request.events)
        logger.debug(f"Using serialized events for {username}")
    else:
        content = request.raw
        logger.debug(f"Using raw content for {username}")
    
    try:
        # Write the file with conflict detection
        new_etag = hday_service.write_hday_file(username, content, request.etag)
        
        # Log to audit
        audit.append(
            target=f"{username}.hday",
            action="write_hday",
            details=f"Updated via API (etag: {new_etag[:16]}...)"
        )
        
        logger.info(f"Successfully wrote .hday file for user: {username}")
        
        return HdayWriteResponse(etag=new_etag)
        
    except HdayConflictError as e:
        logger.warning(f"Conflict writing file for user {username}: {e}")
        
        # Read current file state for conflict response
        try:
            current_raw, current_etag = hday_service.read_hday_file(username)
            current_events = hday_parser.parse_text(current_raw)
            
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=HdayConflictResponse(
                    raw=current_raw,
                    events=current_events,
                    etag=current_etag
                ).model_dump()
            )
        except HdayFileNotFoundError:
            # File was deleted between conflict detection and now
            # Return conflict response with None etag
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=HdayConflictResponse(
                    raw="",
                    events=[],
                    etag="" if e.current_etag is None else e.current_etag
                ).model_dump()
            )
            
    except ShareNotAccessibleError as e:
        logger.error(f"Share directory not accessible: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Share directory not accessible"}
        )
