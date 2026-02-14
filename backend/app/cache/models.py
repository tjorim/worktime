"""Cache entry models for .hday files and team configurations.

This module defines Pydantic models for cache entries with TTL expiry
and mtime validation support.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.hday import HdayEvent


class HdayCacheEntry(BaseModel):
    """Cache entry for .hday file data.
    
    Attributes:
        raw: Raw .hday file content
        events: List of parsed HdayEvent objects
        etag: Precomputed SHA-256 etag for the content
        mtime: File modification timestamp (Unix timestamp)
        cached_at: Timestamp when this entry was cached (for TTL calculation)
    """
    
    raw: str
    events: list[HdayEvent]
    etag: str
    mtime: float
    cached_at: float = Field(default_factory=lambda: datetime.now().timestamp())


class TeamConfigCacheEntry(BaseModel):
    """Cache entry for team configuration data.
    
    Attributes:
        name: Team name from config file
        members: List of team member usernames and display names
        config_mtime: Modification timestamp of config file
        people_mtime: Modification timestamp of people file
        cached_at: Timestamp when this entry was cached (for TTL calculation)
    """
    
    name: str
    members: list[dict]  # List of {"username": str, "display_name": str}
    config_mtime: float
    people_mtime: float
    cached_at: float = Field(default_factory=lambda: datetime.now().timestamp())
