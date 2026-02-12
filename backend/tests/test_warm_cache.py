"""Tests for cache warming functionality."""

import logging
from pathlib import Path
from unittest.mock import patch

import pytest

from app.cache.store import get_cache
from app.cache.warm_cache import (
    _cache_hday_file,
    _cache_team_config,
    _discover_hday_files,
    _discover_team_files,
    warm_cache,
)
from app.config.settings import settings


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory for testing."""
    share = tmp_path / "share"
    share.mkdir()
    monkeypatch.setattr(settings, "SHARE_DIR", str(share))
    return share


class TestDiscoverTeamFiles:
    """Tests for _discover_team_files function."""

    def test_discover_single_team(self, share_dir):
        """Test discovering a single team from config directory."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        (config_dir / "team1.conf").write_text("groupname=Team 1\n", encoding="utf-8")
        (config_dir / "team1.people").write_text("alice,Alice\n", encoding="utf-8")
        
        teams = _discover_team_files(share_dir)
        
        assert len(teams) == 1
        team_id, config_path, people_path = teams[0]
        assert team_id == "team1"
        assert config_path.name == "team1.conf"
        assert people_path.name == "team1.people"
    
    def test_discover_multiple_teams(self, share_dir):
        """Test discovering multiple teams from config directory."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        for i in range(3):
            (config_dir / f"team{i}.conf").write_text(f"groupname=Team {i}\n", encoding="utf-8")
            (config_dir / f"team{i}.people").write_text(f"user{i},User {i}\n", encoding="utf-8")
        
        teams = _discover_team_files(share_dir)
        
        assert len(teams) == 3
        team_ids = {team_id for team_id, _, _ in teams}
        assert team_ids == {"team0", "team1", "team2"}
    
    def test_ignores_conf_without_people(self, share_dir, caplog):
        """Test that .conf files without corresponding .people files are ignored."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        # Valid team
        (config_dir / "team1.conf").write_text("groupname=Team 1\n", encoding="utf-8")
        (config_dir / "team1.people").write_text("alice,Alice\n", encoding="utf-8")
        
        # Incomplete team (missing .people file)
        (config_dir / "team2.conf").write_text("groupname=Team 2\n", encoding="utf-8")
        
        with caplog.at_level(logging.WARNING):
            teams = _discover_team_files(share_dir)
        
        assert len(teams) == 1
        assert teams[0][0] == "team1"
        assert "Found team2.conf but missing corresponding team2.people" in caplog.text
    
    def test_ignores_people_without_conf(self, share_dir):
        """Test that .people files without corresponding .conf files are ignored."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        # Valid team
        (config_dir / "team1.conf").write_text("groupname=Team 1\n", encoding="utf-8")
        (config_dir / "team1.people").write_text("alice,Alice\n", encoding="utf-8")
        
        # Orphaned .people file
        (config_dir / "team2.people").write_text("bob,Bob\n", encoding="utf-8")
        
        teams = _discover_team_files(share_dir)
        
        assert len(teams) == 1
        assert teams[0][0] == "team1"
    
    def test_no_config_directory(self, share_dir, caplog):
        """Test handling when config directory doesn't exist."""
        with caplog.at_level(logging.INFO):
            teams = _discover_team_files(share_dir)
        
        assert len(teams) == 0
        assert "Config directory does not exist or is not a directory" in caplog.text
    
    def test_config_is_file_not_directory(self, share_dir, caplog):
        """Test handling when config path is a file, not a directory."""
        config_file = share_dir / "config"
        config_file.write_text("not a directory", encoding="utf-8")
        
        with caplog.at_level(logging.INFO):
            teams = _discover_team_files(share_dir)
        
        assert len(teams) == 0
        assert "Config directory does not exist or is not a directory" in caplog.text
    
    def test_handles_permission_error(self, share_dir, caplog):
        """Test graceful handling of permission errors."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        with patch.object(Path, "glob", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                teams = _discover_team_files(share_dir)
        
        assert len(teams) == 0
        assert "Could not list config directory during cache warming" in caplog.text
    
    def test_team_id_with_hyphens(self, share_dir):
        """Test team IDs with hyphens (e.g., dl-example-group)."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        (config_dir / "dl-example-group.conf").write_text("groupname=Example Group\n", encoding="utf-8")
        (config_dir / "dl-example-group.people").write_text("alice,Alice\n", encoding="utf-8")
        
        teams = _discover_team_files(share_dir)
        
        assert len(teams) == 1
        assert teams[0][0] == "dl-example-group"


class TestDiscoverHdayFiles:
    """Tests for _discover_hday_files function."""
    
    def test_discover_top_level_hday_files(self, share_dir):
        """Test discovering .hday files at top level."""
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "bob.hday").write_text("2025/02/20 # Conference", encoding="utf-8")
        
        files = _discover_hday_files(share_dir)
        
        assert len(files) == 2
        usernames = {username for _, username in files}
        assert usernames == {"alice", "bob"}
    
    def test_discover_only_root_level_files(self, share_dir):
        """Test that .hday files are only discovered in share root."""
        # Root level file
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        # Create config subdirectory with team files (not for .hday discovery)
        config_dir = share_dir / "config"
        config_dir.mkdir()
        (config_dir / "team1.conf").write_text("groupname=Team 1", encoding="utf-8")
        (config_dir / "team1.people").write_text("bob,Bob\n", encoding="utf-8")
        
        # Create another subdirectory with .hday file (should be ignored)
        other_dir = share_dir / "team1"
        other_dir.mkdir()
        (other_dir / "bob.hday").write_text("2025/02/20 # Conference", encoding="utf-8")
        
        files = _discover_hday_files(share_dir)
        
        # Only root level file should be found
        assert len(files) == 1
        assert files[0][1] == "alice"
    
    def test_discover_with_config_dir(self, share_dir):
        """Test discovering .hday files with config directory present."""
        # Top-level files
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "charlie.hday").write_text("2025/03/10 # Holiday", encoding="utf-8")
        
        # Config directory (not for .hday discovery)
        config_dir = share_dir / "config"
        config_dir.mkdir()
        (config_dir / "team1.conf").write_text("groupname=Team 1", encoding="utf-8")
        (config_dir / "team1.people").write_text("bob,Bob\n", encoding="utf-8")
        
        files = _discover_hday_files(share_dir)
        
        assert len(files) == 2
        usernames = {username for _, username in files}
        assert usernames == {"alice", "charlie"}
    
    def test_ignores_non_hday_files(self, share_dir):
        """Test that non-.hday files are ignored."""
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "readme.txt").write_text("Some notes", encoding="utf-8")
        (share_dir / "config").write_text("Config", encoding="utf-8")
        
        files = _discover_hday_files(share_dir)
        
        assert len(files) == 1
        assert files[0][1] == "alice"
    
    def test_handles_permission_error_top_level(self, share_dir, caplog):
        """Test graceful handling of permission errors at top level."""
        with patch.object(Path, "iterdir", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                files = _discover_hday_files(share_dir)
        
        assert len(files) == 0
        assert "Could not list .hday files during cache warming" in caplog.text


class TestCacheTeamConfig:
    """Tests for _cache_team_config function."""
    
    def test_cache_team_config_success(self, share_dir):
        """Test successfully caching team configuration."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        config_path = config_dir / "team1.conf"
        people_path = config_dir / "team1.people"
        
        config_path.write_text("groupname=Engineering Team\n", encoding="utf-8")
        people_path.write_text("alice,Alice Johnson\nbob,Bob Smith\n", encoding="utf-8")
        
        result = _cache_team_config("team1", config_path, people_path)
        
        assert result is True
        
        cache = get_cache()
        cached = cache.get_team_config("team1")
        assert cached is not None
        assert cached.name == "Engineering Team"
        assert len(cached.members) == 2
        assert cached.members[0]["username"] == "alice"
        assert cached.members[0]["display_name"] == "Alice Johnson"
    
    def test_cache_team_config_with_whitespace(self, share_dir):
        """Test caching team config with extra whitespace."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        config_path = config_dir / "team1.conf"
        people_path = config_dir / "team1.people"
        
        config_path.write_text("  groupname = Team Name  \n", encoding="utf-8")
        people_path.write_text(" alice , Alice Johnson \n  \nbob,Bob\n", encoding="utf-8")
        
        result = _cache_team_config("team1", config_path, people_path)
        
        assert result is True
        
        cache = get_cache()
        cached = cache.get_team_config("team1")
        assert cached.name == "Team Name"
        assert len(cached.members) == 2
    
    def test_cache_team_config_with_html_headers(self, share_dir):
        """Test caching team config with HTML section headers in people file."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        config_path = config_dir / "team1.conf"
        people_path = config_dir / "team1.people"
        
        config_path.write_text("groupname=Engineering Team\n", encoding="utf-8")
        people_path.write_text(
            "<h2>Team Management</h2>\nalice,Alice Johnson\n<h2>Engineers</h2>\nbob,Bob Smith\n",
            encoding="utf-8"
        )
        
        result = _cache_team_config("team1", config_path, people_path)
        
        assert result is True
        
        cache = get_cache()
        cached = cache.get_team_config("team1")
        assert cached is not None
        assert len(cached.members) == 2
        assert cached.members[0]["username"] == "alice"
        assert cached.members[1]["username"] == "bob"
    
    def test_cache_team_config_missing_config_file(self, share_dir, caplog):
        """Test handling missing config file."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        config_path = config_dir / "team1.conf"
        people_path = config_dir / "team1.people"
        
        people_path.write_text("alice,Alice\n", encoding="utf-8")
        
        with caplog.at_level(logging.WARNING):
            result = _cache_team_config("team1", config_path, people_path)
        
        assert result is False
        assert "Could not cache team config for team1" in caplog.text
    
    def test_cache_team_config_missing_groupname(self, share_dir, caplog):
        """Test handling config file without groupname."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        config_path = config_dir / "team1.conf"
        people_path = config_dir / "team1.people"
        
        config_path.write_text("other_key=some value\n", encoding="utf-8")
        people_path.write_text("alice,Alice\n", encoding="utf-8")
        
        with caplog.at_level(logging.WARNING):
            result = _cache_team_config("team1", config_path, people_path)
        
        assert result is False
        assert "Could not cache team config for team1" in caplog.text
        assert "groupname field not found" in caplog.text
    
    def test_cache_team_config_permission_error(self, share_dir, caplog):
        """Test handling permission error."""
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        config_path = config_dir / "team1.conf"
        people_path = config_dir / "team1.people"
        
        config_path.write_text("groupname=Team\n", encoding="utf-8")
        people_path.write_text("alice,Alice\n", encoding="utf-8")
        
        with patch.object(Path, "read_text", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                result = _cache_team_config("team1", config_path, people_path)
        
        assert result is False
        assert "Could not cache team config for team1" in caplog.text


class TestCacheHdayFile:
    """Tests for _cache_hday_file function."""
    
    def test_cache_hday_file_success(self, share_dir):
        """Test successfully caching .hday file."""
        file_path = share_dir / "alice.hday"
        content = "2025/01/15 # Vacation\n2025/02/20 # Conference"
        file_path.write_text(content, encoding="utf-8")
        
        result = _cache_hday_file(file_path, "alice")
        
        assert result is True
        
        cache = get_cache()
        cached = cache.get_hday("alice")
        assert cached is not None
        assert cached.raw == content
        assert len(cached.events) == 2
        assert cached.etag.startswith("sha256:")
    
    def test_cache_hday_file_empty_content(self, share_dir):
        """Test caching empty .hday file."""
        file_path = share_dir / "bob.hday"
        file_path.write_text("", encoding="utf-8")
        
        result = _cache_hday_file(file_path, "bob")
        
        assert result is True
        
        cache = get_cache()
        cached = cache.get_hday("bob")
        assert cached is not None
        assert cached.raw == ""
        assert len(cached.events) == 0
    
    def test_cache_hday_file_missing_file(self, share_dir, caplog):
        """Test handling missing .hday file."""
        file_path = share_dir / "nonexistent.hday"
        
        with caplog.at_level(logging.WARNING):
            result = _cache_hday_file(file_path, "nonexistent")
        
        assert result is False
        assert "Could not cache .hday file" in caplog.text
    
    def test_cache_hday_file_permission_error(self, share_dir, caplog):
        """Test handling permission error."""
        file_path = share_dir / "alice.hday"
        file_path.write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        with patch.object(Path, "read_text", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                result = _cache_hday_file(file_path, "alice")
        
        assert result is False
        assert "Could not cache .hday file" in caplog.text
    
    def test_cache_hday_file_parse_error(self, share_dir, caplog):
        """Test handling parse errors."""
        file_path = share_dir / "alice.hday"
        file_path.write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        with patch("app.cache.warm_cache.parse_text", side_effect=Exception("Parse error")):
            with caplog.at_level(logging.WARNING):
                result = _cache_hday_file(file_path, "alice")
        
        assert result is False
        assert "Could not parse .hday file" in caplog.text


class TestWarmCache:
    """Tests for warm_cache function."""
    
    def test_warm_cache_disabled(self, share_dir, caplog, monkeypatch):
        """Test that cache warming is skipped when disabled."""
        monkeypatch.setattr(settings, "CACHE_ENABLED", False)
        
        with caplog.at_level(logging.INFO):
            warm_cache()
        
        assert "Cache warming skipped (CACHE_ENABLED=False)" in caplog.text
    
    def test_warm_cache_share_dir_not_exists(self, tmp_path, caplog, monkeypatch):
        """Test handling when share directory doesn't exist."""
        nonexistent = tmp_path / "nonexistent"
        monkeypatch.setattr(settings, "SHARE_DIR", str(nonexistent))
        monkeypatch.setattr(settings, "CACHE_ENABLED", True)
        
        with caplog.at_level(logging.WARNING):
            warm_cache()
        
        assert "Cache warming skipped: share directory does not exist" in caplog.text
    
    def test_warm_cache_share_path_not_directory(self, tmp_path, caplog, monkeypatch):
        """Test handling when share path is not a directory."""
        file_path = tmp_path / "notadir.txt"
        file_path.write_text("content", encoding="utf-8")
        monkeypatch.setattr(settings, "SHARE_DIR", str(file_path))
        monkeypatch.setattr(settings, "CACHE_ENABLED", True)
        
        with caplog.at_level(logging.WARNING):
            warm_cache()
        
        assert "Cache warming skipped: share path is not a directory" in caplog.text
    
    def test_warm_cache_success(self, share_dir, caplog):
        """Test successful cache warming with teams and users."""
        # Create config subdirectory with team
        config_dir = share_dir / "config"
        config_dir.mkdir()
        (config_dir / "team1.conf").write_text("groupname=Engineering\n", encoding="utf-8")
        (config_dir / "team1.people").write_text("alice,Alice\nbob,Bob\n", encoding="utf-8")
        
        # Create top-level .hday files (only in share root)
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "charlie.hday").write_text("2025/02/20 # Conference", encoding="utf-8")
        
        with caplog.at_level(logging.INFO):
            warm_cache()
        
        # Check logs
        assert "Cache warming starting..." in caplog.text
        assert "Cache warming complete: 2 users cached, 1 teams cached" in caplog.text
        
        # Verify cache contents
        cache = get_cache()
        
        # Team config
        team_cached = cache.get_team_config("team1")
        assert team_cached is not None
        assert team_cached.name == "Engineering"
        
        # Users
        alice_cached = cache.get_hday("alice")
        assert alice_cached is not None
        
        charlie_cached = cache.get_hday("charlie")
        assert charlie_cached is not None
    
    def test_warm_cache_partial_failure(self, share_dir, caplog):
        """Test cache warming continues after partial failures."""
        # Create config directory
        config_dir = share_dir / "config"
        config_dir.mkdir()
        
        # Create valid team
        (config_dir / "team1.conf").write_text("groupname=Team 1\n", encoding="utf-8")
        (config_dir / "team1.people").write_text("alice,Alice\n", encoding="utf-8")
        
        # Create team with missing people file - will be discovered but fail during caching
        (config_dir / "team2.conf").write_text("groupname=Team 2\n", encoding="utf-8")
        # team2.people file missing intentionally - will trigger warning during discovery
        
        # Create team with missing groupname - will be discovered but fail during caching
        (config_dir / "team3.conf").write_text("other_key=value\n", encoding="utf-8")
        (config_dir / "team3.people").write_text("dave,Dave\n", encoding="utf-8")
        
        # Create valid user
        (share_dir / "charlie.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        with caplog.at_level(logging.INFO):
            warm_cache()
        
        # Should log warnings but continue
        assert "Found team2.conf but missing corresponding team2.people" in caplog.text
        assert "Could not cache team config for team3" in caplog.text
        assert "groupname field not found" in caplog.text
        assert "Cache warming complete: 1 users cached, 1 teams cached" in caplog.text
        
        # Verify successful caches
        cache = get_cache()
        assert cache.get_team_config("team1") is not None
        assert cache.get_team_config("team2") is None
        assert cache.get_team_config("team3") is None
        assert cache.get_hday("charlie") is not None
    
    def test_warm_cache_empty_share(self, share_dir, caplog):
        """Test cache warming with empty share directory."""
        with caplog.at_level(logging.INFO):
            warm_cache()
        
        assert "Cache warming starting..." in caplog.text
        assert "Cache warming complete: 0 users cached, 0 teams cached" in caplog.text
