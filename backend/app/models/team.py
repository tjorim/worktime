"""Pydantic models for team data handling.

This module defines data models for reading and aggregating team information,
including team membership and aggregated .hday data across all team members.
"""

from typing import List, Optional

from pydantic import BaseModel

from app.models.hday import HdayEvent


class TeamMember(BaseModel):
    """Represents a single member of a team.
    
    Attributes:
        username: The username of the team member
        display_name: The display name of the team member
    """
    
    username: str
    display_name: str


class TeamInfoResponse(BaseModel):
    """Response model for team information.
    
    Attributes:
        team_id: The unique identifier for the team
        name: The team name
        members: List of team members
    """
    
    team_id: str
    name: str
    members: List[TeamMember]


class TeamMemberHdayData(BaseModel):
    """Represents .hday data for a single team member.
    
    Attributes:
        username: The username of the team member
        display_name: The display name of the team member
        raw: The raw .hday file content (empty string if file doesn't exist)
        events: List of parsed .hday events (empty list if file doesn't exist)
        etag: Entity tag for the .hday file (None if file doesn't exist)
    """
    
    username: str
    display_name: str
    raw: str
    events: List[HdayEvent]
    etag: Optional[str] = None


class TeamHdayResponse(BaseModel):
    """Response model for aggregated team .hday data.
    
    Attributes:
        team_id: The unique identifier for the team
        members: List of .hday data for each team member
    """
    
    team_id: str
    members: List[TeamMemberHdayData]
