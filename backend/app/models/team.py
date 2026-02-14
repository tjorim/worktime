"""Pydantic models for team data handling.

This module defines data models for reading and aggregating team information,
including team membership and aggregated .hday data across all team members.
"""


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


class TeamSection(BaseModel):
    """Represents a section of team members (optional grouping from .people file headers).
    
    Attributes:
        title: Optional section title from HTML header (None if no header)
        members: List of team members in this section
    """
    
    title: str | None = None
    members: list[TeamMember]


class TeamInfoResponse(BaseModel):
    """Response model for team information.
    
    Attributes:
        team_id: The unique identifier for the team
        name: The team name
        sections: List of team sections (grouped by headers if present in .people file)
        members: Flat list of all team members (for backward compatibility)
    """
    
    team_id: str
    name: str
    sections: list[TeamSection]
    members: list[TeamMember]  # Flat list for backward compatibility


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
    events: list[HdayEvent]
    etag: str | None = None


class TeamSectionHdayData(BaseModel):
    """Represents a section of team members with .hday data.
    
    Attributes:
        title: Optional section title from HTML header (None if no header)
        members: List of team members with .hday data in this section
    """
    
    title: str | None = None
    members: list[TeamMemberHdayData]


class TeamHdayResponse(BaseModel):
    """Response model for aggregated team .hday data.
    
    Attributes:
        team_id: The unique identifier for the team
        name: The team name
        sections: List of team sections with .hday data (grouped by headers if present)
        members: Flat list of all members with .hday data (for backward compatibility)
    """
    
    team_id: str
    name: str
    sections: list[TeamSectionHdayData]
    members: list[TeamMemberHdayData]  # Flat list for backward compatibility
