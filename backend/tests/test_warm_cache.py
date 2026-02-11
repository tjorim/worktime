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
    _discover_team_directories,
    _is_team_directory,
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


class TestIsTeamDirectory:
    """Tests for _is_team_directory helper."""
    
    def test_valid_team_directory(self, share_dir):
        """Test that directory with config and people is recognized as team."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Team 1", encoding="utf-8")
        (team_dir / "people").write_text("alice,Alice\n", encoding="utf-8")
        
        assert _is_team_directory(team_dir)
    
    def test_directory_without_config(self, share_dir):
        """Test that directory without config is not a team directory."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "people").write_text("alice,Alice\n", encoding="utf-8")
        
        assert not _is_team_directory(team_dir)
    
    def test_directory_without_people(self, share_dir):
        """Test that directory without people is not a team directory."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Team 1", encoding="utf-8")
        
        assert not _is_team_directory(team_dir)
    
    def test_not_a_directory(self, share_dir):
        """Test that a file is not a team directory."""
        file_path = share_dir / "notadir.txt"
        file_path.write_text("content", encoding="utf-8")
        
        assert not _is_team_directory(file_path)


class TestDiscoverTeamDirectories:
    """Tests for _discover_team_directories function."""
    
    def test_discover_single_team(self, share_dir):
        """Test discovering a single team directory."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Team 1", encoding="utf-8")
        (team_dir / "people").write_text("alice,Alice\n", encoding="utf-8")
        
        teams = _discover_team_directories(share_dir)
        
        assert len(teams) == 1
        assert teams[0].name == "team1"
    
    def test_discover_multiple_teams(self, share_dir):
        """Test discovering multiple team directories."""
        for i in range(3):
            team_dir = share_dir / f"team{i}"
            team_dir.mkdir()
            (team_dir / "config").write_text(f"Team {i}", encoding="utf-8")
            (team_dir / "people").write_text(f"user{i},User {i}\n", encoding="utf-8")
        
        teams = _discover_team_directories(share_dir)
        
        assert len(teams) == 3
        team_names = {t.name for t in teams}
        assert team_names == {"team0", "team1", "team2"}
    
    def test_ignores_non_team_directories(self, share_dir):
        """Test that non-team directories are ignored."""
        # Create team directory
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Team 1", encoding="utf-8")
        (team_dir / "people").write_text("alice,Alice\n", encoding="utf-8")
        
        # Create non-team directory
        other_dir = share_dir / "other"
        other_dir.mkdir()
        (other_dir / "somefile.txt").write_text("content", encoding="utf-8")
        
        teams = _discover_team_directories(share_dir)
        
        assert len(teams) == 1
        assert teams[0].name == "team1"
    
    def test_handles_permission_error(self, share_dir, caplog):
        """Test graceful handling of permission errors."""
        with patch.object(Path, "iterdir", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                teams = _discover_team_directories(share_dir)
        
        assert len(teams) == 0
        assert "Could not list share directory" in caplog.text


class TestDiscoverHdayFiles:
    """Tests for _discover_hday_files function."""
    
    def test_discover_top_level_hday_files(self, share_dir):
        """Test discovering .hday files at top level."""
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "bob.hday").write_text("2025/02/20 # Conference", encoding="utf-8")
        
        files = _discover_hday_files(share_dir, [])
        
        assert len(files) == 2
        usernames = {username for _, username in files}
        assert usernames == {"alice", "bob"}
    
    def test_discover_team_hday_files(self, share_dir):
        """Test discovering .hday files within team directories."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Team 1", encoding="utf-8")
        (team_dir / "people").write_text("charlie,Charlie\n", encoding="utf-8")
        (team_dir / "charlie.hday").write_text("2025/03/10 # Holiday", encoding="utf-8")
        
        files = _discover_hday_files(share_dir, [team_dir])
        
        assert len(files) == 1
        assert files[0][1] == "charlie"
    
    def test_discover_mixed_hday_files(self, share_dir):
        """Test discovering .hday files from both top-level and teams."""
        # Top-level files
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        # Team files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Team 1", encoding="utf-8")
        (team_dir / "people").write_text("bob,Bob\n", encoding="utf-8")
        (team_dir / "bob.hday").write_text("2025/02/20 # Conference", encoding="utf-8")
        
        files = _discover_hday_files(share_dir, [team_dir])
        
        assert len(files) == 2
        usernames = {username for _, username in files}
        assert usernames == {"alice", "bob"}
    
    def test_ignores_non_hday_files(self, share_dir):
        """Test that non-.hday files are ignored."""
        (share_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        (share_dir / "readme.txt").write_text("Some notes", encoding="utf-8")
        (share_dir / "config").write_text("Config", encoding="utf-8")
        
        files = _discover_hday_files(share_dir, [])
        
        assert len(files) == 1
        assert files[0][1] == "alice"
    
    def test_handles_permission_error_top_level(self, share_dir, caplog):
        """Test graceful handling of permission errors at top level."""
        with patch.object(Path, "iterdir", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                files = _discover_hday_files(share_dir, [])
        
        assert len(files) == 0
        assert "Could not list top-level .hday files" in caplog.text
    
    def test_handles_permission_error_in_team(self, share_dir, caplog):
        """Test graceful handling of permission errors in team directory."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        # Mock iterdir to fail only for team_dir
        original_iterdir = Path.iterdir
        
        def mock_iterdir(self):
            if self == team_dir:
                raise PermissionError("Access denied")
            return original_iterdir(self)
        
        with patch.object(Path, "iterdir", mock_iterdir):
            with caplog.at_level(logging.WARNING):
                files = _discover_hday_files(share_dir, [team_dir])
        
        assert len(files) == 0
        assert "Could not list .hday files in team directory team1" in caplog.text


class TestCacheTeamConfig:
    """Tests for _cache_team_config function."""
    
    def test_cache_team_config_success(self, share_dir):
        """Test successfully caching team configuration."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Engineering Team", encoding="utf-8")
        (team_dir / "people").write_text("alice,Alice Johnson\nbob,Bob Smith\n", encoding="utf-8")
        
        result = _cache_team_config(team_dir)
        
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
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("  Team Name  \n", encoding="utf-8")
        (team_dir / "people").write_text(" alice , Alice Johnson \n  \nbob,Bob\n", encoding="utf-8")
        
        result = _cache_team_config(team_dir)
        
        assert result is True
        
        cache = get_cache()
        cached = cache.get_team_config("team1")
        assert cached.name == "Team Name"
        assert len(cached.members) == 2
    
    def test_cache_team_config_missing_config_file(self, share_dir, caplog):
        """Test handling missing config file."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "people").write_text("alice,Alice\n", encoding="utf-8")
        
        with caplog.at_level(logging.WARNING):
            result = _cache_team_config(team_dir)
        
        assert result is False
        assert "Could not cache team config" in caplog.text
    
    def test_cache_team_config_permission_error(self, share_dir, caplog):
        """Test handling permission error."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        config_file = team_dir / "config"
        config_file.write_text("Team", encoding="utf-8")
        
        with patch.object(Path, "read_text", side_effect=PermissionError("Access denied")):
            with caplog.at_level(logging.WARNING):
                result = _cache_team_config(team_dir)
        
        assert result is False
        assert "Could not cache team config" in caplog.text


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
        # Create team
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        (team_dir / "config").write_text("Engineering", encoding="utf-8")
        (team_dir / "people").write_text("alice,Alice\nbob,Bob\n", encoding="utf-8")
        (team_dir / "alice.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        # Create top-level user
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
        # Create valid team
        team1 = share_dir / "team1"
        team1.mkdir()
        (team1 / "config").write_text("Team 1", encoding="utf-8")
        (team1 / "people").write_text("alice,Alice\n", encoding="utf-8")
        
        # Create team with missing people file - will be discovered but fail to cache
        team2 = share_dir / "team2"
        team2.mkdir()
        (team2 / "config").write_text("Team 2", encoding="utf-8")
        # people file missing intentionally
        
        # Create valid user
        (share_dir / "charlie.hday").write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        # Mock _is_team_directory to return True for both teams
        # so team2 is discovered but fails during caching
        original_is_team = _is_team_directory
        
        def mock_is_team(path):
            if path.name == "team2":
                return True  # Pretend it's valid to test partial failure
            return original_is_team(path)
        
        with patch("app.cache.warm_cache._is_team_directory", mock_is_team):
            with caplog.at_level(logging.INFO):
                warm_cache()
        
        # Should log warnings but continue
        assert "Could not cache team config for team2" in caplog.text
        assert "Cache warming complete: 1 users cached, 1 teams cached" in caplog.text
        
        # Verify successful caches
        cache = get_cache()
        assert cache.get_team_config("team1") is not None
        assert cache.get_team_config("team2") is None
        assert cache.get_hday("charlie") is not None
    
    def test_warm_cache_empty_share(self, share_dir, caplog):
        """Test cache warming with empty share directory."""
        with caplog.at_level(logging.INFO):
            warm_cache()
        
        assert "Cache warming starting..." in caplog.text
        assert "Cache warming complete: 0 users cached, 0 teams cached" in caplog.text
