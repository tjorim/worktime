"""Tests for cache integration in service layer."""

import time
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from app.cache.store import FileCache, get_cache
from app.models.hday import HdayEvent
from app.services.hday_service import (
    HdayConflictError,
    compute_etag,
    read_hday_file,
    write_hday_file,
)
from app.services.team_service import read_team_info, read_team_hday_files
from app.models.team import TeamMember


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory and configure settings to use it."""
    from app.config.settings import settings
    monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path))
    return tmp_path


class TestHdayServiceCacheIntegration:
    """Tests for cache integration in hday_service."""

    def setup_method(self):
        """Reset cache before each test."""
        cache = get_cache()
        cache._hday_entries.clear()
        cache._team_entries.clear()

    def test_read_hday_file_cache_hit(self, tmp_path):
        """Test that read_hday_file returns cached data on cache hit."""
        cache = get_cache()
        content = "2025/01/15 # Vacation"
        etag = compute_etag(content)
        events = [
            HdayEvent(
                type="range",
                start="2025-01-15",
                end="2025-01-15",
                flags=[],
                title="Vacation",
                raw="2025/01/15 # Vacation"
            )
        ]
        
        # Pre-populate cache
        cache.set_hday("testuser", content, events, etag, time.time())
        
        # Read should hit cache without file access
        raw, returned_etag = read_hday_file("testuser")
        
        assert raw == content
        assert returned_etag == etag

    def test_read_hday_file_cache_miss(self, share_dir):
        """Test that read_hday_file reads file and populates cache on miss."""
        cache = get_cache()
        
        # Create test file
        file_path = share_dir / "testuser.hday"
        content = "2025/01/15 # Vacation"
        file_path.write_text(content, encoding="utf-8")
        
        raw, etag = read_hday_file("testuser")
        
        # Verify file was read
        assert raw == content
        assert etag == compute_etag(content)
        
        # Verify cache was populated
        cached_entry = cache.get_hday("testuser")
        assert cached_entry is not None
        assert cached_entry.raw == content
        assert cached_entry.etag == etag

    def test_read_hday_file_stale_cache_unchanged_mtime(self, share_dir, monkeypatch):
        """Test that stale cache entry is refreshed when mtime unchanged."""
        from app.config.settings import settings
        
        cache = get_cache()
        
        # Create test file
        file_path = share_dir / "testuser.hday"
        content = "2025/01/15 # Vacation"
        file_path.write_text(content, encoding="utf-8")
        mtime = file_path.stat().st_mtime
        
        etag = compute_etag(content)
        events = []
        
        # Create stale cache entry (cached_at in the past)
        monkeypatch.setattr(settings, "CACHE_TTL", 1)
        cache.set_hday("testuser", content, events, etag, mtime)
        time.sleep(1.1)  # Make entry stale
        
        # Verify entry is stale
        assert cache.needs_mtime_check("testuser")
        
        raw, returned_etag = read_hday_file("testuser")
        
        # Should return cached data
        assert raw == content
        assert returned_etag == etag
        
        # Cache entry should now be fresh (TTL refreshed)
        cached_entry = cache.get_hday("testuser")
        assert cached_entry is not None

    def test_read_hday_file_stale_cache_changed_mtime(self, share_dir, monkeypatch):
        """Test that stale cache entry is invalidated when mtime changed."""
        from app.config.settings import settings
        
        cache = get_cache()
        
        # Create test file
        file_path = share_dir / "testuser.hday"
        original_content = "2025/01/15 # Original"
        file_path.write_text(original_content, encoding="utf-8")
        original_mtime = file_path.stat().st_mtime
        
        # Create stale cache entry with old mtime
        old_etag = compute_etag(original_content)
        cache.set_hday("testuser", original_content, [], old_etag, original_mtime)
        
        # Update file (this changes mtime)
        time.sleep(0.1)  # Ensure mtime is different
        new_content = "2025/01/15 # Updated"
        file_path.write_text(new_content, encoding="utf-8")
        
        # Make cache entry stale
        monkeypatch.setattr(settings, "CACHE_TTL", 1)
        time.sleep(1.1)
        
        raw, etag = read_hday_file("testuser")
        
        # Should read new content from file
        assert raw == new_content
        assert etag == compute_etag(new_content)
        assert etag != old_etag

    def test_write_hday_file_updates_cache(self, share_dir):
        """Test that write_hday_file updates cache after successful write."""
        cache = get_cache()
        
        content = "2025/01/15 # Vacation"
        etag = write_hday_file("testuser", content, expected_etag=None)
        
        # Verify cache was updated
        cached_entry = cache.get_hday("testuser")
        assert cached_entry is not None
        assert cached_entry.raw == content
        assert cached_entry.etag == etag

    def test_write_hday_file_cached_etag_conflict_new_file(self, share_dir):
        """Test conflict detection using cached etag when creating new file."""
        cache = get_cache()
        
        # Create existing file and populate cache
        file_path = share_dir / "testuser.hday"
        existing_content = "existing content"
        file_path.write_text(existing_content, encoding="utf-8")
        existing_etag = compute_etag(existing_content)
        
        cache.set_hday("testuser", existing_content, [], existing_etag, time.time())
        
        # Try to create new file (expected_etag=None) when file exists
        with pytest.raises(HdayConflictError) as exc_info:
            write_hday_file("testuser", "new content", expected_etag=None)
        
        # Should use cached etag in error
        assert exc_info.value.current_etag == existing_etag

    def test_write_hday_file_cached_etag_conflict_update(self, share_dir):
        """Test conflict detection using cached etag when updating file."""
        cache = get_cache()
        
        # Create existing file and populate cache
        file_path = share_dir / "testuser.hday"
        current_content = "current content"
        file_path.write_text(current_content, encoding="utf-8")
        current_etag = compute_etag(current_content)
        
        cache.set_hday("testuser", current_content, [], current_etag, time.time())
        
        # Try to update with wrong etag
        wrong_etag = "sha256:wrong"
        with pytest.raises(HdayConflictError) as exc_info:
            write_hday_file("testuser", "new content", expected_etag=wrong_etag)
        
        # Should use cached etag in error
        assert exc_info.value.current_etag == current_etag

    def test_write_hday_file_cached_etag_success(self, share_dir):
        """Test successful update using cached etag for conflict detection."""
        cache = get_cache()
        
        # Create existing file and populate cache
        file_path = share_dir / "testuser.hday"
        original_content = "original content"
        file_path.write_text(original_content, encoding="utf-8")
        original_etag = compute_etag(original_content)
        
        cache.set_hday("testuser", original_content, [], original_etag, time.time())
        
        # Update with correct cached etag
        new_content = "new content"
        new_etag = write_hday_file("testuser", new_content, expected_etag=original_etag)
        
        # Verify file was updated
        assert file_path.read_text(encoding="utf-8") == new_content
        
        # Verify cache was updated
        cached_entry = cache.get_hday("testuser")
        assert cached_entry is not None
        assert cached_entry.raw == new_content
        assert cached_entry.etag == new_etag

    def test_read_hday_file_parses_events_for_caching(self, share_dir):
        """Test that read_hday_file parses events even for format=raw requests."""
        cache = get_cache()
        
        # Create test file with parseable content
        file_path = share_dir / "testuser.hday"
        content = "2025/01/15-2025/01/17 # Vacation"
        file_path.write_text(content, encoding="utf-8")
        
        raw, etag = read_hday_file("testuser")
        
        # Verify cache entry has parsed events
        cached_entry = cache.get_hday("testuser")
        assert cached_entry is not None
        assert len(cached_entry.events) > 0
        assert cached_entry.events[0].type == "range"


class TestTeamServiceCacheIntegration:
    """Tests for cache integration in team_service."""

    def setup_method(self):
        """Reset cache before each test."""
        cache = get_cache()
        cache._hday_entries.clear()
        cache._team_entries.clear()

    def test_read_team_info_cache_hit(self):
        """Test that read_team_info returns cached data on cache hit."""
        cache = get_cache()
        
        # Pre-populate cache
        members_data = [
            {"username": "alice", "display_name": "Alice"},
            {"username": "bob", "display_name": "Bob"}
        ]
        cache.set_team_config("team1", "Team One", members_data, time.time(), time.time())
        
        name, members = read_team_info("team1")
        
        assert name == "Team One"
        assert len(members) == 2
        assert members[0].username == "alice"

    def test_read_team_info_cache_miss(self, share_dir):
        """Test that read_team_info reads files and populates cache on miss."""
        cache = get_cache()
        
        # Create test team directory
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Team One", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("alice,Alice\nbob,Bob", encoding="utf-8")
        
        name, members = read_team_info("team1")
        
        # Verify data was read
        assert name == "Team One"
        assert len(members) == 2
        
        # Verify cache was populated
        cached_entry = cache.get_team_config("team1")
        assert cached_entry is not None
        assert cached_entry.name == "Team One"
        assert len(cached_entry.members) == 2

    def test_read_team_info_stale_cache_unchanged_mtimes(self, share_dir, monkeypatch):
        """Test that stale cache entry is refreshed when mtimes unchanged."""
        from app.config.settings import settings
        
        cache = get_cache()
        
        # Create test team directory
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Team One", encoding="utf-8")
        config_mtime = config_file.stat().st_mtime
        
        people_file = team_dir / "people"
        people_file.write_text("alice,Alice", encoding="utf-8")
        people_mtime = people_file.stat().st_mtime
        
        # Create cache entry with old timestamp to make it stale
        members_data = [{"username": "alice", "display_name": "Alice"}]
        cache.set_team_config("team1", "Team One", members_data, config_mtime, people_mtime)
        
        # Manually set the cache entry to be stale by backdating cached_at
        stale_entry = cache._team_entries.get("team1")
        if stale_entry:
            stale_entry.cached_at = time.time() - 20  # 20 seconds ago (default TTL is 10)
        
        # Verify entry is stale - get_team_config_stale should return the entry
        assert cache.get_team_config_stale("team1") is not None
        # get_team_config should return None for stale entry and remove it
        assert cache.get_team_config("team1") is None
        
        # Re-add the stale entry for the actual test
        cache.set_team_config("team1", "Team One", members_data, config_mtime, people_mtime)
        stale_entry = cache._team_entries.get("team1")
        if stale_entry:
            stale_entry.cached_at = time.time() - 20  # Make it stale again
        
        name, members = read_team_info("team1")
        
        # Should return cached data
        assert name == "Team One"
        assert len(members) == 1
        
        # Cache entry should now be fresh after TTL refresh
        cached_entry = cache.get_team_config("team1")
        assert cached_entry is not None

    def test_read_team_info_stale_cache_changed_mtime(self, share_dir):
        """Test that stale cache entry is invalidated when mtime changed."""
        cache = get_cache()
        
        # Create test team directory
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Team One", encoding="utf-8")
        original_config_mtime = config_file.stat().st_mtime
        
        people_file = team_dir / "people"
        people_file.write_text("alice,Alice", encoding="utf-8")
        people_mtime = people_file.stat().st_mtime
        
        # Create cache entry
        members_data = [{"username": "alice", "display_name": "Alice"}]
        cache.set_team_config("team1", "Team One", members_data, original_config_mtime, people_mtime)
        
        # Make entry stale by backdating cached_at
        stale_entry = cache._team_entries.get("team1")
        if stale_entry:
            stale_entry.cached_at = time.time() - 20  # 20 seconds ago
        
        # Update config file (changes mtime)
        time.sleep(0.1)
        config_file.write_text("Team One Updated", encoding="utf-8")
        
        name, members = read_team_info("team1")
        
        # Should read new content since mtime changed
        assert name == "Team One Updated"

    def test_read_team_hday_files_uses_cached_read(self, share_dir):
        """Test that read_team_hday_files leverages individual hday cache entries."""
        cache = get_cache()
        
        # Pre-populate cache for one user
        alice_content = "2025/01/15 # Alice vacation"
        alice_etag = compute_etag(alice_content)
        alice_events = []
        cache.set_hday("alice", alice_content, alice_events, alice_etag, time.time())
        
        # Create file for bob (not in cache)
        bob_file = share_dir / "bob.hday"
        bob_content = "2025/01/20 # Bob vacation"
        bob_file.write_text(bob_content, encoding="utf-8")
        
        members = [
            TeamMember(username="alice", display_name="Alice"),
            TeamMember(username="bob", display_name="Bob")
        ]
        
        member_data = read_team_hday_files("team1", members, team_path=share_dir, parse_events=True)
        
        # Verify both members were processed
        assert len(member_data) == 2
        assert member_data[0].username == "alice"
        assert member_data[0].raw == alice_content  # From cache
        assert member_data[1].username == "bob"
        assert member_data[1].raw == bob_content  # From file


# class TestCacheDisabled:
#     """Tests to ensure cache operations work when cache is disabled."""
# 
#     def test_read_hday_file_with_cache_disabled(self, tmp_path, monkeypatch):
#         """Test that read_hday_file works with cache disabled."""
#         from app.config.settings import settings
#         
#         # Set both SHARE_DIR and CACHE_ENABLED in one monkeypatch session
#         monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path))
#         monkeypatch.setattr(settings, "CACHE_ENABLED", False)
#         
#         # Create test file
#         file_path = tmp_path / "testuser.hday"
#         content = "2025/01/15 # Vacation"
#         file_path.write_text(content, encoding="utf-8")
#         
#         # Test should work without cache
#         raw, etag = read_hday_file("testuser")
#         
#         assert raw == content
#         assert etag == compute_etag(content)
# 
#     def test_write_hday_file_with_cache_disabled(self, tmp_path, monkeypatch):
#         """Test that write_hday_file works with cache disabled."""
#         from app.config.settings import settings
#         
#         # Set both SHARE_DIR and CACHE_ENABLED in one monkeypatch session
#         monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path))
#         monkeypatch.setattr(settings, "CACHE_ENABLED", False)
#         
#         file_path = tmp_path / "testuser.hday"
#         content = "2025/01/15 # Vacation"
#         
#         # Test should work without cache
#         etag = write_hday_file("testuser", content, expected_etag=None)
#         
#         assert file_path.exists()
#                 assert etag == compute_etag(content)

