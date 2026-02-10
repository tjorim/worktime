"""Tests for cache module."""

import time
from unittest.mock import patch

import pytest

from app.cache.models import HdayCacheEntry, TeamConfigCacheEntry
from app.cache.store import FileCache, get_cache
from app.models.hday import HdayEvent


class TestCacheModels:
    """Tests for cache entry models."""
    
    def test_hday_cache_entry_creation(self):
        """Test creating HdayCacheEntry with all fields."""
        events = [
            HdayEvent(
                type="range",
                start="2025-01-15",
                end="2025-01-17",
                flags=["holiday"],
                title="Vacation",
                raw="2025/01/15-2025/01/17 # Vacation"
            )
        ]
        
        entry = HdayCacheEntry(
            raw="2025/01/15-2025/01/17 # Vacation",
            events=events,
            etag="sha256:abc123",
            mtime=1234567890.0,
            cached_at=1234567900.0
        )
        
        assert entry.raw == "2025/01/15-2025/01/17 # Vacation"
        assert len(entry.events) == 1
        assert entry.events[0].type == "range"
        assert entry.etag == "sha256:abc123"
        assert entry.mtime == 1234567890.0
        assert entry.cached_at == 1234567900.0
    
    def test_hday_cache_entry_default_cached_at(self):
        """Test that cached_at defaults to current timestamp."""
        before = time.time()
        entry = HdayCacheEntry(
            raw="test",
            events=[],
            etag="sha256:test",
            mtime=1234567890.0
        )
        after = time.time()
        
        assert before <= entry.cached_at <= after
    
    def test_team_config_cache_entry_creation(self):
        """Test creating TeamConfigCacheEntry with all fields."""
        members = [
            {"username": "alice", "display_name": "Alice Johnson"},
            {"username": "bob", "display_name": "Bob Smith"}
        ]
        
        entry = TeamConfigCacheEntry(
            name="Engineering Team",
            members=members,
            config_mtime=1234567890.0,
            people_mtime=1234567891.0,
            cached_at=1234567900.0
        )
        
        assert entry.name == "Engineering Team"
        assert len(entry.members) == 2
        assert entry.members[0]["username"] == "alice"
        assert entry.config_mtime == 1234567890.0
        assert entry.people_mtime == 1234567891.0
        assert entry.cached_at == 1234567900.0
    
    def test_team_config_cache_entry_default_cached_at(self):
        """Test that cached_at defaults to current timestamp."""
        before = time.time()
        entry = TeamConfigCacheEntry(
            name="Test Team",
            members=[],
            config_mtime=1234567890.0,
            people_mtime=1234567891.0
        )
        after = time.time()
        
        assert before <= entry.cached_at <= after


class TestFileCacheSingleton:
    """Tests for FileCache singleton behavior."""
    
    def test_singleton_pattern(self):
        """Test that FileCache follows singleton pattern."""
        cache1 = FileCache()
        cache2 = FileCache()
        
        assert cache1 is cache2
    
    def test_get_cache_returns_singleton(self):
        """Test that get_cache returns the singleton instance."""
        cache1 = get_cache()
        cache2 = get_cache()
        cache3 = FileCache()
        
        assert cache1 is cache2
        assert cache1 is cache3


class TestFileCacheHdayOperations:
    """Tests for .hday cache operations."""
    
    def setup_method(self):
        """Reset cache before each test."""
        cache = FileCache()
        cache._hday_entries.clear()
        cache._team_entries.clear()
    
    def test_get_hday_cache_miss(self):
        """Test getting non-existent entry returns None."""
        cache = FileCache()
        result = cache.get_hday("alice")
        
        assert result is None
    
    def test_set_and_get_hday(self):
        """Test storing and retrieving .hday entry."""
        cache = FileCache()
        events = [
            HdayEvent(
                type="range",
                start="2025-01-15",
                end="2025-01-17",
                flags=["holiday"],
                title="Vacation",
                raw="2025/01/15-2025/01/17 # Vacation"
            )
        ]
        
        cache.set_hday(
            username="alice",
            raw="2025/01/15-2025/01/17 # Vacation",
            events=events,
            etag="sha256:abc123",
            mtime=1234567890.0
        )
        
        result = cache.get_hday("alice")
        
        assert result is not None
        assert result.raw == "2025/01/15-2025/01/17 # Vacation"
        assert len(result.events) == 1
        assert result.etag == "sha256:abc123"
        assert result.mtime == 1234567890.0
    
    def test_get_hday_stale_entry_removed(self):
        """Test that stale entries are removed and return None."""
        cache = FileCache()
        
        # Create entry with old cached_at timestamp
        with patch("app.cache.store.settings.CACHE_TTL", 10):
            old_time = time.time() - 20  # 20 seconds ago (beyond 10s TTL)
            cache._hday_entries["alice"] = HdayCacheEntry(
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0,
                cached_at=old_time
            )
            
            result = cache.get_hday("alice")
            
            assert result is None
            assert "alice" not in cache._hday_entries
    
    def test_invalidate_hday(self):
        """Test invalidating .hday cache entry."""
        cache = FileCache()
        
        cache.set_hday(
            username="alice",
            raw="test",
            events=[],
            etag="sha256:test",
            mtime=1234567890.0
        )
        
        assert cache.get_hday("alice") is not None
        
        cache.invalidate_hday("alice")
        
        assert cache.get_hday("alice") is None
    
    def test_invalidate_hday_nonexistent(self):
        """Test invalidating non-existent entry doesn't raise error."""
        cache = FileCache()
        
        # Should not raise any exception
        cache.invalidate_hday("nonexistent")
    
    def test_needs_mtime_check_no_entry(self):
        """Test needs_mtime_check returns False for missing entry."""
        cache = FileCache()
        
        result = cache.needs_mtime_check("alice")
        
        assert result is False
    
    def test_needs_mtime_check_fresh_entry(self):
        """Test needs_mtime_check returns False for fresh entry."""
        cache = FileCache()
        
        cache.set_hday(
            username="alice",
            raw="test",
            events=[],
            etag="sha256:test",
            mtime=1234567890.0
        )
        
        result = cache.needs_mtime_check("alice")
        
        assert result is False
    
    def test_needs_mtime_check_stale_entry(self):
        """Test needs_mtime_check returns True for stale entry."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_TTL", 10):
            old_time = time.time() - 20  # 20 seconds ago (beyond 10s TTL)
            cache._hday_entries["alice"] = HdayCacheEntry(
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0,
                cached_at=old_time
            )
            
            result = cache.needs_mtime_check("alice")
            
            assert result is True


class TestFileCacheTeamOperations:
    """Tests for team config cache operations."""
    
    def setup_method(self):
        """Reset cache before each test."""
        cache = FileCache()
        cache._hday_entries.clear()
        cache._team_entries.clear()
    
    def test_get_team_config_cache_miss(self):
        """Test getting non-existent team config returns None."""
        cache = FileCache()
        result = cache.get_team_config("team1")
        
        assert result is None
    
    def test_set_and_get_team_config(self):
        """Test storing and retrieving team config entry."""
        cache = FileCache()
        members = [
            {"username": "alice", "display_name": "Alice Johnson"},
            {"username": "bob", "display_name": "Bob Smith"}
        ]
        
        cache.set_team_config(
            team_id="team1",
            name="Engineering Team",
            members=members,
            config_mtime=1234567890.0,
            people_mtime=1234567891.0
        )
        
        result = cache.get_team_config("team1")
        
        assert result is not None
        assert result.name == "Engineering Team"
        assert len(result.members) == 2
        assert result.members[0]["username"] == "alice"
        assert result.config_mtime == 1234567890.0
        assert result.people_mtime == 1234567891.0
    
    def test_get_team_config_stale_entry_removed(self):
        """Test that stale team config entries are removed and return None."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_TTL", 10):
            old_time = time.time() - 20  # 20 seconds ago (beyond 10s TTL)
            cache._team_entries["team1"] = TeamConfigCacheEntry(
                name="Test Team",
                members=[],
                config_mtime=1234567890.0,
                people_mtime=1234567891.0,
                cached_at=old_time
            )
            
            result = cache.get_team_config("team1")
            
            assert result is None
            assert "team1" not in cache._team_entries
    
    def test_invalidate_team_config(self):
        """Test invalidating team config cache entry."""
        cache = FileCache()
        
        cache.set_team_config(
            team_id="team1",
            name="Test Team",
            members=[],
            config_mtime=1234567890.0,
            people_mtime=1234567891.0
        )
        
        assert cache.get_team_config("team1") is not None
        
        cache.invalidate_team_config("team1")
        
        assert cache.get_team_config("team1") is None
    
    def test_invalidate_team_config_nonexistent(self):
        """Test invalidating non-existent team config doesn't raise error."""
        cache = FileCache()
        
        # Should not raise any exception
        cache.invalidate_team_config("nonexistent")


class TestFileCacheCacheDisabled:
    """Tests for cache behavior when CACHE_ENABLED=False."""
    
    def setup_method(self):
        """Reset cache before each test."""
        cache = FileCache()
        cache._hday_entries.clear()
        cache._team_entries.clear()
    
    def test_get_hday_disabled(self):
        """Test get_hday returns None when cache disabled."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            # First set an entry while cache is enabled
            with patch("app.cache.store.settings.CACHE_ENABLED", True):
                cache.set_hday(
                    username="alice",
                    raw="test",
                    events=[],
                    etag="sha256:test",
                    mtime=1234567890.0
                )
            
            # Now try to get it with cache disabled
            result = cache.get_hday("alice")
            
            assert result is None
    
    def test_set_hday_disabled(self):
        """Test set_hday is no-op when cache disabled."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            cache.set_hday(
                username="alice",
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0
            )
            
            # Entry should not be stored
            assert "alice" not in cache._hday_entries
    
    def test_invalidate_hday_disabled(self):
        """Test invalidate_hday is no-op when cache disabled."""
        cache = FileCache()
        
        # Set entry while cache enabled
        with patch("app.cache.store.settings.CACHE_ENABLED", True):
            cache.set_hday(
                username="alice",
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0
            )
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            # Should not raise error
            cache.invalidate_hday("alice")
    
    def test_needs_mtime_check_disabled(self):
        """Test needs_mtime_check returns False when cache disabled."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            result = cache.needs_mtime_check("alice")
            
            assert result is False
    
    def test_get_team_config_disabled(self):
        """Test get_team_config returns None when cache disabled."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            # First set an entry while cache is enabled
            with patch("app.cache.store.settings.CACHE_ENABLED", True):
                cache.set_team_config(
                    team_id="team1",
                    name="Test Team",
                    members=[],
                    config_mtime=1234567890.0,
                    people_mtime=1234567891.0
                )
            
            # Now try to get it with cache disabled
            result = cache.get_team_config("team1")
            
            assert result is None
    
    def test_set_team_config_disabled(self):
        """Test set_team_config is no-op when cache disabled."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            cache.set_team_config(
                team_id="team1",
                name="Test Team",
                members=[],
                config_mtime=1234567890.0,
                people_mtime=1234567891.0
            )
            
            # Entry should not be stored
            assert "team1" not in cache._team_entries
    
    def test_invalidate_team_config_disabled(self):
        """Test invalidate_team_config is no-op when cache disabled."""
        cache = FileCache()
        
        # Set entry while cache enabled
        with patch("app.cache.store.settings.CACHE_ENABLED", True):
            cache.set_team_config(
                team_id="team1",
                name="Test Team",
                members=[],
                config_mtime=1234567890.0,
                people_mtime=1234567891.0
            )
        
        with patch("app.cache.store.settings.CACHE_ENABLED", False):
            # Should not raise error
            cache.invalidate_team_config("team1")


class TestFileCacheTTLBehavior:
    """Tests for TTL-based cache expiry behavior."""
    
    def setup_method(self):
        """Reset cache before each test."""
        cache = FileCache()
        cache._hday_entries.clear()
        cache._team_entries.clear()
    
    def test_fresh_entry_within_ttl(self):
        """Test that entries within TTL are considered fresh."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_TTL", 60):
            cache.set_hday(
                username="alice",
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0
            )
            
            # Entry was just created, should be fresh
            result = cache.get_hday("alice")
            assert result is not None
    
    def test_stale_entry_beyond_ttl(self):
        """Test that entries beyond TTL are considered stale."""
        cache = FileCache()
        
        with patch("app.cache.store.settings.CACHE_TTL", 1):
            cache.set_hday(
                username="alice",
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0
            )
            
            # Wait for entry to become stale
            time.sleep(1.1)
            
            # Entry should be stale and removed
            result = cache.get_hday("alice")
            assert result is None
    
    def test_different_ttl_values(self):
        """Test cache respects different TTL values from settings."""
        cache = FileCache()
        
        # Test with 0 TTL (everything is immediately stale)
        with patch("app.cache.store.settings.CACHE_TTL", 0):
            cache.set_hday(
                username="alice",
                raw="test",
                events=[],
                etag="sha256:test",
                mtime=1234567890.0
            )
            
            # Even immediately after setting, it's stale with TTL=0
            result = cache.get_hday("alice")
            assert result is None
