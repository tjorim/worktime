"""In-memory cache store for holiday data.

This module provides a singleton FileCache class that manages cached data
with TTL expiry support.
"""

from __future__ import annotations

import logging
from datetime import datetime

from app.cache.models import HolidayCacheEntry
from app.config.settings import settings

logger = logging.getLogger(__name__)


class FileCache:
    """Singleton in-memory cache for holiday data.

    This cache provides fast access to frequently-accessed data with
    TTL-based expiry. When CACHE_ENABLED=False, all operations become
    no-ops that return cache misses.
    """

    _instance: FileCache | None = None

    def __new__(cls):
        """Ensure singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize cache storage if not already initialized."""
        if self._initialized:
            return

        self._holiday_entries: dict[str, HolidayCacheEntry] = {}
        self._initialized = True
        logger.info("FileCache initialized")

    def _is_enabled(self) -> bool:
        """Check if caching is enabled in settings.

        Returns:
            True if caching is enabled, False otherwise
        """
        return settings.CACHE_ENABLED

    def _is_fresh(self, cached_at: float, ttl: int | None = None) -> bool:
        """Check if a cache entry is fresh based on TTL.

        Args:
            cached_at: Timestamp when the entry was cached
            ttl: Optional TTL override in seconds. Defaults to settings.CACHE_TTL.

        Returns:
            True if the entry is within TTL, False if stale
        """
        current_time = datetime.now().timestamp()
        age = current_time - cached_at
        effective_ttl = ttl if ttl is not None else settings.CACHE_TTL
        return age < effective_ttl

    # Holiday cache operations

    def get_holiday(self, cache_key: str) -> HolidayCacheEntry | None:
        """Get cached holiday data entry.

        Returns the cached entry if it exists and is fresh (within HOLIDAY_CACHE_TTL),
        or None if the entry is missing or stale.

        Args:
            cache_key: Unique key identifying the holiday request

        Returns:
            Cached entry if fresh, None otherwise
        """
        if not self._is_enabled():
            return None

        entry = self._holiday_entries.get(cache_key)
        if entry is None:
            return None

        if not self._is_fresh(entry.cached_at, ttl=settings.HOLIDAY_CACHE_TTL):
            del self._holiday_entries[cache_key]
            return None

        return entry

    def set_holiday(self, cache_key: str, data: list) -> None:
        """Store holiday data in cache.

        Args:
            cache_key: Unique key identifying the holiday request
            data: Raw JSON response from the upstream holiday API
        """
        if not self._is_enabled():
            return

        entry = HolidayCacheEntry(data=data)
        self._holiday_entries[cache_key] = entry
        logger.debug("Cached holiday entry (TTL: %ss)", settings.HOLIDAY_CACHE_TTL)


# Global cache instance
_cache: FileCache | None = None


def get_cache() -> FileCache:
    """Get the global FileCache singleton instance.
    
    Returns:
        The FileCache singleton instance
    """
    global _cache
    if _cache is None:
        _cache = FileCache()
    return _cache
