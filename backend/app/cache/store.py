"""In-memory cache store for .hday files and team configurations.

This module provides a singleton FileCache class that manages cached data
with TTL expiry and mtime validation support.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from app.cache.models import HdayCacheEntry, TeamConfigCacheEntry
from app.config.settings import settings
from app.models.hday import HdayEvent

logger = logging.getLogger(__name__)


class FileCache:
    """Singleton in-memory cache for .hday files and team configurations.
    
    This cache provides fast access to frequently-accessed file data with
    TTL-based expiry and mtime validation support for detecting external changes.
    When CACHE_ENABLED=False, all operations become no-ops that return cache misses.
    """
    
    _instance: Optional["FileCache"] = None
    
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
            
        self._hday_entries: Dict[str, HdayCacheEntry] = {}
        self._team_entries: Dict[str, TeamConfigCacheEntry] = {}
        self._initialized = True
        logger.info("FileCache initialized")
    
    def _is_enabled(self) -> bool:
        """Check if caching is enabled in settings.
        
        Returns:
            True if caching is enabled, False otherwise
        """
        return settings.CACHE_ENABLED
    
    def _is_fresh(self, cached_at: float) -> bool:
        """Check if a cache entry is fresh based on TTL.
        
        Args:
            cached_at: Timestamp when the entry was cached
            
        Returns:
            True if the entry is within TTL, False if stale
        """
        current_time = datetime.now().timestamp()
        age = current_time - cached_at
        return age < settings.CACHE_TTL
    
    # .hday cache operations
    
    def get_hday(self, username: str) -> Optional[HdayCacheEntry]:
        """Get cached .hday entry for a username.
        
        Returns the cached entry if it exists and is fresh (within TTL),
        or None if the entry is missing or stale.
        
        Args:
            username: The username to lookup
            
        Returns:
            Cached entry if fresh, None otherwise
        """
        if not self._is_enabled():
            return None
            
        entry = self._hday_entries.get(username)
        if entry is None:
            return None
            
        if not self._is_fresh(entry.cached_at):
            # Entry is stale, remove it
            del self._hday_entries[username]
            return None
            
        return entry
    
    def set_hday(
        self,
        username: str,
        raw: str,
        events: List[HdayEvent],
        etag: str,
        mtime: float
    ) -> None:
        """Store .hday entry in cache.
        
        Args:
            username: The username to cache
            raw: Raw .hday file content
            events: List of parsed HdayEvent objects
            etag: Precomputed SHA-256 etag
            mtime: File modification timestamp
        """
        if not self._is_enabled():
            return
            
        entry = HdayCacheEntry(
            raw=raw,
            events=events,
            etag=etag,
            mtime=mtime,
            cached_at=datetime.now().timestamp()
        )
        self._hday_entries[username] = entry
        logger.debug(f"Cached .hday entry (TTL: {settings.CACHE_TTL}s)")
    
    def invalidate_hday(self, username: str) -> None:
        """Remove .hday entry from cache.
        
        Args:
            username: The username to invalidate
        """
        if not self._is_enabled():
            return
            
        if username in self._hday_entries:
            del self._hday_entries[username]
            logger.debug("Invalidated .hday cache entry")
    
    def needs_mtime_check(self, username: str) -> bool:
        """Check if an entry exists but may need mtime validation.
        
        This signals when a cache entry is stale (beyond TTL) but may still
        be valid if the file's mtime hasn't changed.
        
        Args:
            username: The username to check
            
        Returns:
            True if entry exists but is stale, False otherwise
        """
        if not self._is_enabled():
            return False
            
        entry = self._hday_entries.get(username)
        if entry is None:
            return False
            
        # Entry exists but is stale
        return not self._is_fresh(entry.cached_at)
    
    def get_hday_stale(self, username: str) -> Optional[HdayCacheEntry]:
        """Get cached .hday entry even if stale (for mtime validation).
        
        Returns the cached entry if it exists, regardless of TTL.
        Does not remove stale entries from cache.
        Use this when you want to check if mtime has changed.
        
        Args:
            username: The username to lookup
            
        Returns:
            Cached entry if exists, None otherwise
        """
        if not self._is_enabled():
            return None
            
        return self._hday_entries.get(username)
    
    def refresh_hday_ttl(self, username: str) -> None:
        """Refresh the TTL of an existing cache entry.
        
        Updates the cached_at timestamp to current time, extending the TTL
        without changing the cached data. Use this when file mtime is unchanged.
        
        Args:
            username: The username to refresh
        """
        if not self._is_enabled():
            return
            
        entry = self._hday_entries.get(username)
        if entry is not None:
            # Update cached_at to refresh TTL
            entry.cached_at = datetime.now().timestamp()
            logger.debug("Refreshed .hday cache entry TTL")
    
    # Team config cache operations
    
    def get_team_config(self, team_id: str) -> Optional[TeamConfigCacheEntry]:
        """Get cached team configuration entry.
        
        Returns the cached entry if it exists and is fresh (within TTL),
        or None if the entry is missing or stale.
        
        Args:
            team_id: The team identifier to lookup
            
        Returns:
            Cached entry if fresh, None otherwise
        """
        if not self._is_enabled():
            return None
            
        entry = self._team_entries.get(team_id)
        if entry is None:
            return None
            
        if not self._is_fresh(entry.cached_at):
            # Entry is stale, remove it
            del self._team_entries[team_id]
            return None
            
        return entry
    
    def set_team_config(
        self,
        team_id: str,
        name: str,
        members: List[dict],
        config_mtime: float,
        people_mtime: float
    ) -> None:
        """Store team configuration entry in cache.
        
        Args:
            team_id: The team identifier
            name: Team name from config file
            members: List of team member dicts with username and display_name
            config_mtime: Modification timestamp of config file
            people_mtime: Modification timestamp of people file
        """
        if not self._is_enabled():
            return
            
        entry = TeamConfigCacheEntry(
            name=name,
            members=members,
            config_mtime=config_mtime,
            people_mtime=people_mtime,
            cached_at=datetime.now().timestamp()
        )
        self._team_entries[team_id] = entry
        logger.debug(f"Cached team config entry (TTL: {settings.CACHE_TTL}s)")
    
    def invalidate_team_config(self, team_id: str) -> None:
        """Remove team configuration entry from cache.
        
        Args:
            team_id: The team identifier to invalidate
        """
        if not self._is_enabled():
            return
            
        if team_id in self._team_entries:
            del self._team_entries[team_id]
            logger.debug("Invalidated team config cache entry")
    
    def get_team_config_stale(self, team_id: str) -> Optional[TeamConfigCacheEntry]:
        """Get cached team config entry even if stale (for mtime validation).
        
        Returns the cached entry if it exists, regardless of TTL.
        Does not remove stale entries from cache.
        Use this when you want to check if mtime has changed.
        
        Args:
            team_id: The team identifier to lookup
            
        Returns:
            Cached entry if exists, None otherwise
        """
        if not self._is_enabled():
            return None
            
        return self._team_entries.get(team_id)
    
    def refresh_team_config_ttl(self, team_id: str) -> None:
        """Refresh the TTL of an existing team config cache entry.
        
        Updates the cached_at timestamp to current time, extending the TTL
        without changing the cached data. Use this when file mtimes are unchanged.
        
        Args:
            team_id: The team identifier to refresh
        """
        if not self._is_enabled():
            return
            
        entry = self._team_entries.get(team_id)
        if entry is not None:
            # Update cached_at to refresh TTL
            entry.cached_at = datetime.now().timestamp()
            logger.debug("Refreshed team config cache entry TTL")


# Global cache instance
_cache: Optional[FileCache] = None


def get_cache() -> FileCache:
    """Get the global FileCache singleton instance.
    
    Returns:
        The FileCache singleton instance
    """
    global _cache
    if _cache is None:
        _cache = FileCache()
    return _cache
