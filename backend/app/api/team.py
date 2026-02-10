"""REST API endpoints for team data retrieval operations.

This module provides HTTP endpoints for reading team information and
aggregating .hday files across all team members.
"""

import logging
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.models.team import TeamHdayResponse, TeamInfoResponse
from app.services.hday_service import ShareNotAccessibleError
from app.services.team_service import (
    TeamNotFoundError,
    _parse_members_file,
    get_team_path,
    read_team_hday_files,
    read_team_info,
)
from app.services import hday_parser
from app.utils.timing import time_operation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Team"])


@router.get("/v1/team/{team_id}")
def get_team_info(team_id: str) -> TeamInfoResponse:
    """Get team information including name and members.
    
    Retrieves the team name from the config file and member list from the people file.
    
    Args:
        team_id: The unique identifier for the team
        
    Returns:
        TeamInfoResponse with team_id, name, and members list
        
    Raises:
        400: Invalid team_id format
        404: Team not found
        503: Share directory not accessible
    """
    try:
        # Read both team name and members with a single team_path lookup
        team_name, members = read_team_info(team_id)
        
        logger.info("Successfully retrieved team info")
        
        return TeamInfoResponse(
            team_id=team_id,
            name=team_name,
            members=members
        )
    
    except ValueError as e:
        logger.info("Invalid team_id format")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team_id format"
        ) from e
        
    except TeamNotFoundError as e:
        logger.info("Team not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        ) from e
        
    except ShareNotAccessibleError as e:
        logger.exception("Share directory not accessible")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Share directory not accessible"
        ) from e


@router.get("/v1/team/{team_id}/hday")
def get_team_hday(
    team_id: str,
    format: Literal["raw", "parsed"] = Query("raw")
) -> TeamHdayResponse:
    """Get aggregated .hday data for all team members.
    
    Retrieves and optionally parses .hday files for all members of the team.
    For members without .hday files, returns empty data with etag=None.
    
    Args:
        team_id: The unique identifier for the team
        format: Response format - "raw" (default) or "parsed" to include events
        
    Returns:
        TeamHdayResponse with team_id and list of member .hday data
        
    Response Headers:
        X-File-Read-Ms: Time taken to read files in milliseconds
        X-Parse-Time-Ms: Time taken to parse events (0 if format=raw)
        
    Raises:
        400: Invalid team_id format
        404: Team not found
        503: Share directory not accessible
    """
    # Dictionary to store timing measurements
    timings = {}
    
    try:
        # Get team path once for both operations (optimization)
        team_path = get_team_path(team_id)
        
        # Read team members from the validated path
        people_path = team_path / "people"
        members = _parse_members_file(people_path)
        logger.info(f"Successfully read {len(members)} team members")
        
        # Read all .hday files (without parsing) and time it
        with time_operation("file_read", timings):
            member_data = read_team_hday_files(team_id, members, team_path, parse_events=False)
        
        # If format=parsed, parse the raw content for each member
        if format == "parsed":
            with time_operation("parse", timings):
                for member in member_data:
                    if member.raw:  # Only parse if there's content
                        try:
                            member.events = hday_parser.parse_text(member.raw)
                        except Exception:
                            # If parsing fails, use empty events list
                            member.events = []
        else:
            # No parsing performed for raw format
            timings["parse"] = 0.0
        
        logger.info(f"Successfully read bulk .hday data for {len(member_data)} members")
        
        # Prepare response data
        response_data = TeamHdayResponse(
            team_id=team_id,
            members=member_data
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
    
    except ValueError as e:
        logger.info("Invalid team_id format")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team_id format"
        ) from e
        
    except TeamNotFoundError as e:
        logger.info("Team not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        ) from e
        
    except ShareNotAccessibleError as e:
        logger.exception("Share directory not accessible")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Share directory not accessible"
        ) from e
