"""REST API endpoints for team data retrieval operations.

This module provides HTTP endpoints for reading team information and
aggregating .hday files across all team members.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.models.team import TeamHdayResponse, TeamInfoResponse
from app.services.hday_service import ShareNotAccessibleError
from app.services.team_service import (
    TeamNotFoundError,
    _parse_members_file,
    get_team_path,
    read_team_hday_files,
    read_team_info,
)

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
def get_team_hday(team_id: str) -> TeamHdayResponse:
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
        # Get team path once for both operations (optimization)
        team_path = get_team_path(team_id)
        
        # Read team members from the validated path
        people_path = team_path / "people"
        members = _parse_members_file(people_path)
        logger.info(f"Successfully read {len(members)} team members")
        
        # Read all .hday files using the same validated path
        member_data = read_team_hday_files(team_id, members, team_path)
        
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
