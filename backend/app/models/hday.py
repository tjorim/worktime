"""Pydantic models for .hday file handling.

This module defines data models for parsing and serializing .hday format files,
which are human-readable text files for managing time-off events.
"""

from typing import Literal

from pydantic import BaseModel, Field


# Define all valid event flags
Flag = Literal[
    "half_am",
    "half_pm",
    "business",
    "weekend",
    "birthday",
    "ill",
    "in",
    "course",
    "other",
    "onsite",
    "no_fly",
    "can_fly",
    "holiday",
]


class HdayEvent(BaseModel):
    """Represents a single event in an .hday file.
    
    An event can be one of three types:
    - range: A time-off period with start and end dates
    - weekly: A recurring weekly event on a specific weekday
    - unknown: An unrecognized line preserved for round-trip fidelity
    """
    
    type: Literal["range", "weekly", "unknown"]
    start: str | None = None
    end: str | None = None
    weekday: int | None = None
    flags: list[Flag] = Field(default_factory=list)
    title: str | None = ""
    raw: str | None = ""


class HdayReadResponse(BaseModel):
    """Response model for reading an .hday file.
    
    Attributes:
        username: The username whose .hday file was read
        raw: The raw content of the .hday file
        etag: Entity tag for conflict detection
        events: Optional list of parsed events (present for format=parsed, absent for format=raw)
    """
    
    username: str
    raw: str
    etag: str
    events: list[HdayEvent] | None = None


class HdayWriteRequest(BaseModel):
    """Request model for writing an .hday file.
    
    Attributes:
        raw: Optional raw .hday content to write
        events: Optional list of parsed events to serialize
        etag: Entity tag for conflict detection (None for new files)
    """
    
    raw: str | None = None
    events: list[HdayEvent] | None = None
    etag: str | None = None


class HdayWriteResponse(BaseModel):
    """Response model for a successful write operation.
    
    Attributes:
        etag: The new entity tag after the write
    """
    
    etag: str


class HdayConflictResponse(BaseModel):
    """Response model for a conflict during write operation.
    
    Attributes:
        raw: The current raw content in the file
        events: The parsed events from the current content
        etag: The current entity tag
    """
    
    raw: str
    events: list[HdayEvent]
    etag: str
