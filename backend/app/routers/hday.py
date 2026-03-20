"""REST API endpoints for .hday file CRUD operations.

This module provides HTTP endpoints for reading and writing .hday files
with proper error handling, response formatting, and audit logging.
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
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
from app.utils.timing import time_operation

logger = logging.getLogger(__name__)

# Length of etag preview in audit log details
ETAG_PREVIEW_LENGTH = 16

router = APIRouter(tags=["Hday Files"])


@router.get("/v1/hday/{username}")
def get_hday_file(
    username: str,
    format: Literal["raw", "parsed"] = Query("raw")
) -> HdayReadResponse:
    """Get a user's .hday file content.
    
    Retrieves the raw content and etag for conflict detection.
    Optionally parses events when format=parsed.
    
    Args:
        username: The username whose .hday file to retrieve
        format: Response format - "raw" (default) or "parsed" to include events
        
    Returns:
        HdayReadResponse with username, raw content, etag, and optionally events
        
    Response Headers:
        X-File-Read-Ms: Time taken to read the file in milliseconds
        X-Parse-Time-Ms: Time taken to parse events (0 if format=raw)
        
    Raises:
        404: File not found for user
        503: Share directory not accessible
    """
    # Dictionary to store timing measurements
    timings = {}
    
    try:
        # Time the file read operation
        with time_operation("file_read", timings):
            raw, etag = hday_service.read_hday_file(username)
        logger.info("Successfully read .hday file")
        
        # Conditionally parse events based on format parameter
        events = None
        if format == "parsed":
            try:
                with time_operation("parse", timings):
                    events = hday_parser.parse_text(raw)
            except Exception:
                # If parsing fails, return empty events list rather than crashing
                events = []
        else:
            # No parsing performed for raw format
            timings["parse"] = 0.0
        
        # Prepare response data
        response_data = HdayReadResponse(
            username=username,
            raw=raw,
            etag=etag,
            events=events
        )
        
        # Return JSONResponse with timing headers
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response_data.model_dump(mode="json"),
            headers={
                "X-File-Read-Ms": f"{timings.get('file_read', 0):.3f}",
                "X-Parse-Time-Ms": f"{timings.get('parse', 0):.3f}",
            }
        )
        
    except HdayFileNotFoundError:
        logger.info("File not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No events found for user: {username}"
        )
        
    except (ShareNotAccessibleError, PermissionError) as e:
        logger.error("Share directory not accessible", exc_info=e)
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
        logger.warning("PUT request with neither raw nor events")
        raise HTTPException(
            status_code=422,
            detail="Either 'raw' or 'events' must be provided"
        )
    
    # Content resolution logic
    # If both raw and events provided, events takes precedence
    if request.events is not None:
        content = hday_parser.to_text(request.events)
        logger.debug("Using serialized events")
    else:
        # Raw text is written directly when request.raw is provided
        content = request.raw
        logger.debug("Using raw content")
    
    try:
        # Write the file with conflict detection
        new_etag = hday_service.write_hday_file(username, content, request.etag)
        
        # Log to audit
        audit.append(
            target=f"{username}.hday",
            action="write_hday",
            details=f"Updated via API (etag: {new_etag[:ETAG_PREVIEW_LENGTH]}...)"
        )
        
        logger.info("Successfully wrote .hday file")
        
        return HdayWriteResponse(etag=new_etag)
        
    except HdayConflictError as e:
        logger.warning("Conflict writing file")
        
        # Read current file state for conflict response
        try:
            current_raw, current_etag = hday_service.read_hday_file(username)
            try:
                current_events = hday_parser.parse_text(current_raw)
            except Exception:
                # If parsing fails, return empty events list rather than crashing
                current_events = []
            
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
            # Return conflict response indicating no current file exists
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=HdayConflictResponse(
                    raw="",
                    events=[],
                    etag=e.current_etag or ""  # Use empty string if None
                ).model_dump()
            )
            
    except ShareNotAccessibleError as e:
        logger.error("Share directory not accessible", exc_info=e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Share directory not accessible"}
        )
