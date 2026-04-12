"""Integration tests for cache in service layer.

Tests the cache integration with read_hday_file(), write_hday_file(), 
read_team_info(), and read_team_hday_files() functions.
"""

import time
from unittest.mock import patch

import pytest

from app.cache.store import get_cache
from app.config.settings import settings
from app.models.team import TeamMember
from app.services.hday_service import (
    HdayConflictError,
    read_hday_file,
    write_hday_file,
)
from app.services.team_service import (
    read_team_hday_files,
    read_team_info,
)


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory for testing."""
    share = tmp_path / "share"
    share.mkdir()
    monkeypatch.setattr(settings, "SHARE_DIR", str(share))
    return share


class TestHdayServiceCacheIntegration:
    """Tests for cache integration in hday service functions."""
    
    def test_read_hday_file_fresh_cache_hit(self, share_dir):
        """Test that fresh cache entry is returned without file I/O."""
        # Create a file
        username = "testuser"
        content = "2025/01/15 # Vacation"
        file_path = share_dir / f"{username}.hday"
        file_path.write_text(content, encoding="utf-8")
        
        # First read - populates cache
        raw1, etag1 = read_hday_file(username)
        assert raw1 == content
        
        # Verify cache has entry
        cache = get_cache()
        cached_entry = cache.get_hday(username)
        assert cached_entry is not None
        assert cached_entry.raw == content
        assert len(cached_entry.events) == 1  # Should have parsed events
        
        # Modify file after caching
        new_content = "2025/02/20 # Conference"
        file_path.write_text(new_content, encoding="utf-8")
        
        # Second read - should return cached data (not new content)
        raw2, etag2 = read_hday_file(username)
        assert raw2 == content  # Still old content
        assert etag2 == etag1
    
    def test_read_hday_file_stale_cache_mtime_unchanged(self, share_dir):
        """Test that stale entry with unchanged mtime refreshes TTL."""
        username = "testuser"
        content = "2025/01/15 # Vacation"
        file_path = share_dir / f"{username}.hday"
        file_path.write_text(content, encoding="utf-8")
        
        # First read - populates cache
        raw1, etag1 = read_hday_file(username)
        
        cache = get_cache()
        
        # Artificially make entry stale
        with patch("app.cache.store.settings.CACHE_TTL", 0.1):
            time.sleep(0.15)
            
            # Entry should be stale but mtime unchanged
            assert cache.needs_mtime_check(username)
            
            # Read again - should refresh TTL without re-reading file
            raw2, etag2 = read_hday_file(username)
            
            assert raw2 == content
            assert etag2 == etag1
            
            # Verify entry is fresh again
            cached_entry = cache.get_hday(username)
            assert cached_entry is not None
    
    def test_read_hday_file_stale_cache_mtime_changed(self, share_dir):
        """Test that stale entry with changed mtime re-reads file."""
        username = "testuser"
        content1 = "2025/01/15 # Vacation"
        file_path = share_dir / f"{username}.hday"
        file_path.write_text(content1, encoding="utf-8")
        
        # First read - populates cache
        raw1, etag1 = read_hday_file(username)
        
        cache = get_cache()
        
        # Make entry stale and modify file
        with patch("app.cache.store.settings.CACHE_TTL", 0.1):
            time.sleep(0.15)
            
            # Modify file
            content2 = "2025/02/20 # Conference"
            time.sleep(0.1)  # Ensure mtime changes
            file_path.write_text(content2, encoding="utf-8")
            
            # Read again - should detect mtime change and re-read
            raw2, etag2 = read_hday_file(username)
            
            assert raw2 == content2  # New content
            assert etag2 != etag1
            
            # Verify cache updated
            cached_entry = cache.get_hday(username)
            assert cached_entry is not None
            assert cached_entry.raw == content2
    
    def test_read_hday_file_always_parses_events(self, share_dir):
        """Test that events are always parsed and cached."""
        username = "testuser"
        content = "2025/01/15 # Vacation\n2025/02/20 # Conference"
        file_path = share_dir / f"{username}.hday"
        file_path.write_text(content, encoding="utf-8")
        
        # Read file
        raw, etag = read_hday_file(username)
        
        # Check cache has parsed events
        cache = get_cache()
        cached_entry = cache.get_hday(username)
        assert cached_entry is not None
        assert len(cached_entry.events) == 2
        assert cached_entry.events[0].title == "Vacation"
        assert cached_entry.events[1].title == "Conference"
    
    def test_write_hday_file_updates_cache(self, share_dir):
        """Test that write_hday_file updates cache."""
        username = "testuser"
        content = "2025/01/15 # Vacation"
        
        # Write new file
        etag = write_hday_file(username, content, expected_etag=None)
        
        # Verify cache was updated
        cache = get_cache()
        cached_entry = cache.get_hday(username)
        assert cached_entry is not None
        assert cached_entry.raw == content
        assert cached_entry.etag == etag
        assert len(cached_entry.events) == 1
    
    def test_write_hday_file_cached_conflict_detection(self, share_dir):
        """Test that conflict detection uses cached etag."""
        username = "testuser"
        content1 = "2025/01/15 # Vacation"
        
        # Write initial file
        etag1 = write_hday_file(username, content1, expected_etag=None)
        
        # Cache should have etag now
        cache = get_cache()
        cached_entry = cache.get_hday(username)
        assert cached_entry is not None
        
        # Try to update with wrong etag - should use cached etag for detection
        content2 = "2025/02/20 # Conference"
        wrong_etag = "sha256:wrong"
        
        with pytest.raises(HdayConflictError) as exc_info:
            write_hday_file(username, content2, expected_etag=wrong_etag)
        
        # Verify conflict error has correct current etag
        assert exc_info.value.current_etag == etag1
    
    def test_write_hday_file_update_refreshes_cache(self, share_dir):
        """Test that updating file refreshes cache."""
        username = "testuser"
        content1 = "2025/01/15 # Vacation"
        
        # Write initial file
        etag1 = write_hday_file(username, content1, expected_etag=None)
        
        # Update file
        content2 = "2025/02/20 # Conference"
        etag2 = write_hday_file(username, content2, expected_etag=etag1)
        
        # Verify cache was updated
        cache = get_cache()
        cached_entry = cache.get_hday(username)
        assert cached_entry is not None
        assert cached_entry.raw == content2
        assert cached_entry.etag == etag2
        assert len(cached_entry.events) == 1
        assert cached_entry.events[0].title == "Conference"


class TestTeamServiceCacheIntegration:
    """Tests for cache integration in team service functions."""
    
    def setup_method(self):
        """Clear cache before each test."""
        cache = get_cache()
        cache._hday_entries.clear()
        cache._team_entries.clear()
    
    def test_read_team_info_fresh_cache_hit(self, share_dir):
        """Test that fresh cache entry is returned without file I/O."""
        team_id = "team1"
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        # Create config and people files in config/ subdirectory
        (config_dir / f"{team_id}.conf").write_text("groupname=Engineering Team", encoding="utf-8")
        (config_dir / f"{team_id}.people").write_text("jdoe,John Doe\nasmith,Alice Smith", encoding="utf-8")
        
        # First read - populates cache
        name1, members1 = read_team_info(team_id)
        assert name1 == "Engineering Team"
        assert len(members1) == 2
        
        # Verify cache has entry
        cache = get_cache()
        cached_entry = cache.get_team_config(team_id)
        assert cached_entry is not None
        assert cached_entry.name == "Engineering Team"
        assert len(cached_entry.members) == 2
        
        # Modify files after caching
        (config_dir / f"{team_id}.conf").write_text("groupname=New Team Name", encoding="utf-8")
        
        # Second read - should return cached data
        name2, members2 = read_team_info(team_id)
        assert name2 == "Engineering Team"  # Still old name
        assert len(members2) == 2
    
    def test_read_team_info_stale_cache_mtime_unchanged(self, share_dir):
        """Test that stale entry with unchanged mtime refreshes TTL."""
        team_id = "team1"
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        (config_dir / f"{team_id}.conf").write_text("groupname=Engineering Team", encoding="utf-8")
        (config_dir / f"{team_id}.people").write_text("jdoe,John Doe", encoding="utf-8")
        
        # First read
        name1, members1 = read_team_info(team_id)
        
        cache = get_cache()
        
        # Make entry stale
        with patch("app.cache.store.settings.CACHE_TTL", 0.1):
            time.sleep(0.15)
            
            # Entry should be stale but mtime unchanged
            assert cache.needs_team_config_mtime_check(team_id)
            
            # Read again - should refresh TTL
            name2, members2 = read_team_info(team_id)
            
            assert name2 == name1
            
            # Verify entry is fresh again
            cached_entry = cache.get_team_config(team_id)
            assert cached_entry is not None
    
    def test_read_team_info_stale_cache_mtime_changed(self, share_dir):
        """Test that stale entry with changed mtime re-reads files."""
        team_id = "team1"
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        (config_dir / f"{team_id}.conf").write_text("groupname=Engineering Team", encoding="utf-8")
        (config_dir / f"{team_id}.people").write_text("jdoe,John Doe", encoding="utf-8")
        
        # First read
        name1, members1 = read_team_info(team_id)
        
        cache = get_cache()
        
        # Make entry stale and modify file
        with patch("app.cache.store.settings.CACHE_TTL", 0.1):
            time.sleep(0.15)
            
            # Modify config file
            time.sleep(0.1)  # Ensure mtime changes
            (config_dir / f"{team_id}.conf").write_text("groupname=New Team Name", encoding="utf-8")
            
            # Read again - should detect mtime change
            name2, members2 = read_team_info(team_id)
            
            assert name2 == "New Team Name"  # New name
            
            # Verify cache updated
            cached_entry = cache.get_team_config(team_id)
            assert cached_entry is not None
            assert cached_entry.name == "New Team Name"
    
    def test_read_team_hday_files_uses_individual_cache(self, share_dir):
        """Test that read_team_hday_files leverages individual hday cache entries."""
        members = [
            TeamMember(username="jdoe", display_name="John Doe"),
            TeamMember(username="asmith", display_name="Alice Smith"),
        ]
        
        # Create hday files in share root
        (share_dir / "jdoe.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "asmith.hday").write_text("2025/02/20 # Conference", encoding="utf-8")
        
        # First read - populates cache
        member_data1 = read_team_hday_files(members)
        assert len(member_data1) == 2
        
        # Verify cache has entries for both users
        cache = get_cache()
        jdoe_entry = cache.get_hday("jdoe")
        asmith_entry = cache.get_hday("asmith")
        assert jdoe_entry is not None
        assert asmith_entry is not None
        
        # Modify files
        (share_dir / "jdoe.hday").write_text("2025/03/10 # Sick day", encoding="utf-8")
        (share_dir / "asmith.hday").write_text("2025/04/15 # Training", encoding="utf-8")
        
        # Second read - should return cached data
        member_data2 = read_team_hday_files(members)
        
        # Should have old data from cache
        jdoe_data = next(m for m in member_data2 if m.username == "jdoe")
        asmith_data = next(m for m in member_data2 if m.username == "asmith")
        
        assert "Vacation" in jdoe_data.raw
        assert "Conference" in asmith_data.raw
    
    def test_read_team_hday_files_respects_parse_events_flag(self, share_dir):
        """Test that parse_events flag is respected but cache still has parsed events."""
        members = [TeamMember(username="jdoe", display_name="John Doe")]
        
        (share_dir / "jdoe.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        # Read with parse_events=False
        member_data = read_team_hday_files(members, parse_events=False)
        
        # Response should have empty events
        assert len(member_data[0].events) == 0
        
        # But cache should have parsed events
        cache = get_cache()
        cached_entry = cache.get_hday("jdoe")
        assert cached_entry is not None
        assert len(cached_entry.events) == 1
