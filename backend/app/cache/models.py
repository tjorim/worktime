"""Cache entry models for holiday data.

This module defines Pydantic models for cache entries with TTL expiry
support.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class HolidayCacheEntry(BaseModel):
    """Cache entry for holiday data from openholidaysapi.org.

    Attributes:
        data: Raw JSON response as a list of holiday objects
        cached_at: Timestamp when this entry was cached (for TTL calculation)
    """

    data: list
    cached_at: float = Field(default_factory=lambda: datetime.now().timestamp())
