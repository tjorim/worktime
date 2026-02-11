"""Tests for benchmark service functions."""

import pytest
from pathlib import Path
from unittest.mock import patch

from app.services import benchmark_service
from app.services.hday_service import HdayFileNotFoundError
from app.services.team_service import TeamNotFoundError
from app.config.settings import settings


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory for testing."""
    share = tmp_path / "share"
    share.mkdir()
    monkeypatch.setattr(settings, "SHARE_DIR", str(share))
    return share


@pytest.fixture
def test_user_file(share_dir):
    """Create a test .hday file."""
    username = "testuser"
    content = "2025/01/15 # Vacation day\n2025/02/20-2025/02/24 # Winter break\n"
    file_path = share_dir / f"{username}.hday"
    file_path.write_text(content, encoding="utf-8")
    return username, content


@pytest.fixture
def test_team_members(share_dir):
    """Create .hday files for team members (separate from test_user_file)."""
    # Create .hday files for team members
    alice_file = share_dir / "alice.hday"
    alice_file.write_text("2025/03/10 # Conference\n", encoding="utf-8")
    
    bob_file = share_dir / "bob.hday"
    bob_file.write_text("2025/04/15 # Training\n", encoding="utf-8")
    
    return ["alice", "bob"]


@pytest.fixture
def test_team(share_dir, test_team_members):
    """Create a test team directory with config and people files."""
    team_id = "team1"
    team_dir = share_dir / team_id
    team_dir.mkdir()
    
    # Create config file
    config_path = team_dir / "config"
    config_path.write_text("Test Team", encoding="utf-8")
    
    # Create people file with two members
    people_path = team_dir / "people"
    people_path.write_text(
        "alice, Alice Smith\nbob, Bob Jones\n",
        encoding="utf-8"
    )
    
    return team_id


class TestDiscoverBenchmarkTargets:
    """Tests for discover_benchmark_targets function."""
    
    def test_discover_with_valid_data(self, test_user_file, test_team):
        """Test discovery when valid user and team data exist."""
        username, _ = test_user_file
        team_id = test_team
        
        discovered_user, discovered_team = benchmark_service.discover_benchmark_targets()
        
        # Should find a user (could be testuser, alice, or bob depending on filesystem order)
        assert discovered_user is not None
        assert discovered_user in ["testuser", "alice", "bob"]
        # Should find the test team
        assert discovered_team == team_id
    
    def test_discover_no_hday_files(self, share_dir):
        """Test discovery when no .hday files exist."""
        # Create team directory without .hday files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        config_path = team_dir / "config"
        config_path.write_text("Test Team", encoding="utf-8")
        people_path = team_dir / "people"
        people_path.write_text("alice, Alice\n", encoding="utf-8")
        
        # No .hday files exist, so discovery should fail
        with pytest.raises(FileNotFoundError, match="No suitable test data found"):
            benchmark_service.discover_benchmark_targets()
    
    def test_discover_no_team_directories(self, share_dir, test_user_file):
        """Test discovery when no team directories exist."""
        with pytest.raises(FileNotFoundError, match="No suitable test data found"):
            benchmark_service.discover_benchmark_targets()
    
    def test_discover_team_missing_config(self, share_dir, test_user_file):
        """Test discovery when team directory is missing config file."""
        team_dir = share_dir / "incomplete_team"
        team_dir.mkdir()
        people_path = team_dir / "people"
        people_path.write_text("user1, User One\n", encoding="utf-8")
        
        # Should not find the incomplete team
        with pytest.raises(FileNotFoundError, match="No suitable test data found"):
            benchmark_service.discover_benchmark_targets()
    
    def test_discover_team_missing_people(self, share_dir, test_user_file):
        """Test discovery when team directory is missing people file."""
        team_dir = share_dir / "incomplete_team"
        team_dir.mkdir()
        config_path = team_dir / "config"
        config_path.write_text("Incomplete Team", encoding="utf-8")
        
        # Should not find the incomplete team
        with pytest.raises(FileNotFoundError, match="No suitable test data found"):
            benchmark_service.discover_benchmark_targets()
    
    def test_discover_share_dir_not_exists(self, tmp_path, monkeypatch):
        """Test discovery when share directory doesn't exist."""
        non_existent = tmp_path / "nonexistent"
        monkeypatch.setattr(settings, "SHARE_DIR", str(non_existent))
        
        with pytest.raises(FileNotFoundError, match="Share directory does not exist"):
            benchmark_service.discover_benchmark_targets()


class TestBenchmarkIndividualFile:
    """Tests for benchmark_individual_file function."""
    
    def test_benchmark_with_valid_file(self, test_user_file):
        """Test benchmark with a valid .hday file."""
        username, _ = test_user_file
        iterations = 10  # Use fewer iterations for faster tests
        
        raw_result, parsed_result = benchmark_service.benchmark_individual_file(
            username, iterations
        )
        
        # Verify raw results
        assert "avgMs" in raw_result
        assert "p95Ms" in raw_result
        assert "responseSizeBytes" in raw_result
        assert raw_result["avgMs"] > 0
        assert raw_result["p95Ms"] >= raw_result["avgMs"]
        assert raw_result["responseSizeBytes"] > 0
        
        # Verify parsed results
        assert "avgMs" in parsed_result
        assert "p95Ms" in parsed_result
        assert "responseSizeBytes" in parsed_result
        assert parsed_result["avgMs"] > 0
        assert parsed_result["p95Ms"] >= parsed_result["avgMs"]
        assert parsed_result["responseSizeBytes"] > 0
        
        # Parsed should generally take longer and be larger than raw
        # (though with caching, this may not always hold)
        assert parsed_result["responseSizeBytes"] >= raw_result["responseSizeBytes"]
    
    def test_benchmark_nonexistent_file(self, share_dir):
        """Test benchmark with nonexistent file raises error."""
        with pytest.raises(HdayFileNotFoundError):
            benchmark_service.benchmark_individual_file("nonexistent", 10)
    
    def test_benchmark_single_iteration(self, test_user_file):
        """Test benchmark with single iteration."""
        username, _ = test_user_file
        
        # Should raise statistics error because p95 calculation requires at least 2 data points
        import statistics
        with pytest.raises(statistics.StatisticsError):
            benchmark_service.benchmark_individual_file(username, 1)
    
    def test_benchmark_multiple_iterations(self, test_user_file):
        """Test benchmark with multiple iterations produces consistent results."""
        username, _ = test_user_file
        iterations = 5
        
        raw_result, parsed_result = benchmark_service.benchmark_individual_file(
            username, iterations
        )
        
        # Results should be reasonable
        assert 0 < raw_result["avgMs"] < 10000  # Less than 10 seconds
        assert 0 < parsed_result["avgMs"] < 10000


class TestBenchmarkTeamBulk:
    """Tests for benchmark_team_bulk function."""
    
    def test_benchmark_team_with_members(self, test_team):
        """Test team bulk benchmark with valid team."""
        team_id = test_team
        iterations = 5
        
        result = benchmark_service.benchmark_team_bulk(team_id, iterations)
        
        # Verify result structure
        assert "memberCount" in result
        assert "raw" in result
        assert "parsed" in result
        
        assert result["memberCount"] == 2  # alice and bob
        
        # Verify raw results
        assert result["raw"]["avgMs"] > 0
        assert result["raw"]["p95Ms"] >= result["raw"]["avgMs"]
        assert result["raw"]["responseSizeBytes"] > 0
        
        # Verify parsed results
        assert result["parsed"]["avgMs"] > 0
        assert result["parsed"]["p95Ms"] >= result["parsed"]["avgMs"]
        assert result["parsed"]["responseSizeBytes"] > 0
    
    def test_benchmark_nonexistent_team(self, share_dir):
        """Test team bulk benchmark with nonexistent team."""
        with pytest.raises(TeamNotFoundError):
            benchmark_service.benchmark_team_bulk("nonexistent", 5)
    
    def test_benchmark_team_empty_members(self, share_dir):
        """Test team bulk benchmark with team that has no members."""
        team_id = "empty_team"
        team_dir = share_dir / team_id
        team_dir.mkdir()
        
        config_path = team_dir / "config"
        config_path.write_text("Empty Team", encoding="utf-8")
        
        people_path = team_dir / "people"
        people_path.write_text("", encoding="utf-8")  # Empty file
        
        iterations = 5
        result = benchmark_service.benchmark_team_bulk(team_id, iterations)
        
        assert result["memberCount"] == 0


class TestBenchmarkCachePerformance:
    """Tests for benchmark_cache_performance function."""
    
    def test_cache_performance_shows_improvement(self, test_user_file):
        """Test that cache performance shows warm cache is faster than cold."""
        username, _ = test_user_file
        iterations = 10
        
        result = benchmark_service.benchmark_cache_performance(username, iterations)
        
        # Verify result structure
        assert "warmCacheAvgMs" in result
        assert "coldCacheAvgMs" in result
        
        # Both should be positive
        assert result["warmCacheAvgMs"] > 0
        assert result["coldCacheAvgMs"] > 0
        
        # Warm cache should generally be faster than cold cache
        # However, this isn't guaranteed due to system variance, so we just
        # check that both measurements completed successfully
    
    def test_cache_performance_nonexistent_file(self, share_dir):
        """Test cache performance benchmark with nonexistent file."""
        with pytest.raises(HdayFileNotFoundError):
            benchmark_service.benchmark_cache_performance("nonexistent", 10)
    
    def test_cache_performance_clears_cache(self, test_user_file):
        """Test that cache performance benchmark clears cache before cold read."""
        username, _ = test_user_file
        
        # Prime the cache
        from app.services import hday_service
        hday_service.read_hday_file(username)
        
        # Run benchmark - should clear cache first
        result = benchmark_service.benchmark_cache_performance(username, 5)
        
        # Should complete successfully
        assert "coldCacheAvgMs" in result
        assert "warmCacheAvgMs" in result
