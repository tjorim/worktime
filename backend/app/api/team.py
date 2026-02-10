"""REST API endpoints for team data retrieval operations.

This module provides HTTP endpoints for reading team information and
aggregating .hday files across all team members.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from app.models.team import TeamHdayResponse, TeamInfoResponse
from app.services.hday_service import ShareNotAccessibleError
from app.services.team_service import (
    TeamNotFoundError,
    read_team_hday_files,
    read_team_info,
    read_team_members,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Team"])


@router.get("/v1/team/{team_id}")
async def get_team_info(team_id: str) -> TeamInfoResponse:
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
        )
        
    except TeamNotFoundError as e:
        logger.info("Team not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
        
    except ShareNotAccessibleError as e:
        logger.error("Share directory not accessible", exc_info=e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Share directory not accessible"}
        )


@router.get("/v1/team/{team_id}/hday")
async def get_team_hday(team_id: str) -> TeamHdayResponse:
    """Get aggregated .hday data for all team members.
    
    Retrieves and parses .hday files for all members of the team.
    For members without .hday files, returns empty data with etag=None.
    
    Args:
        team_id: The unique identifier for the team
        
    Returns:
        TeamHdayResponse with team_id and list of member .hday data
        
    Raises:
        400: Invalid team_id format
        404: Team not found
        503: Share directory not accessible
    """
    try:
        # First read team members
        members = read_team_members(team_id)
        
        # Then read all .hday files
        member_data = read_team_hday_files(team_id, members)
        
        logger.info(f"Successfully read bulk .hday data for {len(member_data)} members")
        
        return TeamHdayResponse(
            team_id=team_id,
            members=member_data
        )
    
    except ValueError as e:
        logger.info("Invalid team_id format")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team_id format"
        )
        
    except TeamNotFoundError as e:
        logger.info("Team not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
        
    except ShareNotAccessibleError as e:
        logger.error("Share directory not accessible", exc_info=e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Share directory not accessible"}
        )
