"""REST API endpoints for team data retrieval operations.

This module provides HTTP endpoints for reading team information and
aggregating .hday files across all team members.
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse

from app.models.team import TeamHdayResponse, TeamInfoResponse, TeamSectionHdayData
from app.services import hday_parser
from app.services.hday_service import ShareNotAccessibleError
from app.services.team_service import (
    TeamNotFoundError,
    read_team_hday_files,
    read_team_info_with_sections,
)
from app.utils.timing import time_operation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Team"])


@router.get("/team/{team_id}")
def get_team_info(team_id: str) -> TeamInfoResponse:
    """Get team information including name, members, and optional section grouping.
    
    Retrieves the team name from the config file and member list from the people file.
    If the people file contains HTML section headers (e.g., <h2>Team Management</h2>),
    members will be grouped by section. Otherwise, a single section with title=null is returned.
    
    Args:
        team_id: The unique identifier for the team
        
    Returns:
        TeamInfoResponse with team_id, name, sections (grouped members), and flat members list
        
    Raises:
        400: Invalid team_id format
        404: Team not found
        503: Share directory not accessible
    """
    try:
        # Read team name, sections, and flat members list
        team_name, sections, members = read_team_info_with_sections(team_id)
        
        logger.info("Successfully retrieved team info with sections")
        
        return TeamInfoResponse(
            team_id=team_id,
            name=team_name,
            sections=sections,
            members=members  # Flat list for backward compatibility
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


@router.get("/team/{team_id}/hday", response_model=TeamHdayResponse)
def get_team_hday(
    team_id: str,
    format: Literal["raw", "parsed"] = Query("raw")
) -> Response:
    """Get aggregated .hday data for all team members with team info and section grouping.
    
    Retrieves team name, member list with sections (if headers exist in people file),
    and optionally parses .hday files for all members. For members without .hday files,
    returns empty data with etag=None.
    
    If the people file contains HTML section headers (e.g., <h2>Team Management</h2>),
    members will be grouped by section. Otherwise, a single section with title=null is returned.
    
    Args:
        team_id: The unique identifier for the team
        format: Response format - "raw" (default) or "parsed" to include events
        
    Returns:
        TeamHdayResponse with team_id, name, sections (grouped member .hday data), 
        and flat members list for backward compatibility
        
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
        # Get team info with sections (name, sections, and flat members)
        team_name, sections, flat_members = read_team_info_with_sections(team_id)
        logger.info(f"Successfully read team info: {team_name} with {len(flat_members)} members in {len(sections)} section(s)")
        
        # Read all .hday files (without parsing) and time it
        with time_operation("file_read", timings):
            flat_member_data = read_team_hday_files(flat_members, parse_events=False)
        
        # If format=parsed, parse the raw content for each member
        if format == "parsed":
            with time_operation("parse", timings):
                for member in flat_member_data:
                    if member.raw:  # Only parse if there's content
                        try:
                            member.events = hday_parser.parse_text(member.raw)
                        except Exception:
                            # If parsing fails, use empty events list
                            member.events = []
        else:
            # No parsing performed for raw format
            timings["parse"] = 0.0
        
        logger.info(f"Successfully read bulk .hday data for {len(flat_member_data)} members")
        
        # Build a lookup dict for fast access to .hday data by username
        hday_lookup = {m.username: m for m in flat_member_data}
        
        # Build sections with .hday data
        sections_with_hday = []
        for section in sections:
            section_members_hday = []
            for member in section.members:
                # Get the .hday data for this member (guaranteed to exist)
                hday_data = hday_lookup[member.username]
                section_members_hday.append(hday_data)
            
            sections_with_hday.append(TeamSectionHdayData(
                title=section.title,
                members=section_members_hday
            ))
        
        # Prepare response data
        response_data = TeamHdayResponse(
            team_id=team_id,
            name=team_name,
            sections=sections_with_hday,
            members=flat_member_data  # Flat list for backward compatibility
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
