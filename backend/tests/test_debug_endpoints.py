"""Tests for debug API endpoints."""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path

from app.main import app
from app.config.settings import settings


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory for testing."""
    share = tmp_path / "share"
    share.mkdir()
    monkeypatch.setattr(settings, "SHARE_DIR", str(share))
    return share


@pytest.fixture
def test_data(share_dir):
    """Create complete test data (user file and team)."""
    # Create user .hday file
    username = "testuser"
    user_content = "2025/01/15 # Vacation\n2025/02/20-2025/02/24 # Winter break\n"
    user_file = share_dir / f"{username}.hday"
    user_file.write_text(user_content, encoding="utf-8")
    
    # Create config directory with team files
    team_id = "team1"
    config_dir = share_dir / "config"
    config_dir.mkdir()

    config_path = config_dir / f"{team_id}.conf"
    config_path.write_text("groupname=Test Team\n", encoding="utf-8")

    people_path = config_dir / f"{team_id}.people"
    people_path.write_text("alice, Alice Smith\nbob, Bob Jones\n", encoding="utf-8")
    
    # Create .hday files for team members
    alice_file = share_dir / "alice.hday"
    alice_file.write_text("2025/03/10 # Conference\n", encoding="utf-8")
    
    bob_file = share_dir / "bob.hday"
    bob_file.write_text("2025/04/15 # Training\n", encoding="utf-8")
    
    return username, team_id


class TestDebugBenchmarkEndpoint:
    """Tests for GET /debug/benchmark endpoint."""
    
    def test_benchmark_with_valid_data(self, client, test_data):
        """Test benchmark endpoint with valid test data."""
        username, team_id = test_data
        
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "file" in data
        assert "fileSize" in data
        assert "eventCount" in data
        assert "iterations" in data
        assert "raw" in data
        assert "parsed" in data
        assert "teamBulk" in data
        assert "cache" in data
        
        # Verify file metadata (could be any of the test files)
        assert data["file"].endswith(".hday")
        assert data["fileSize"] > 0
        assert data["eventCount"] >= 1  # Should have at least 1 event
        assert data["iterations"] == 100
        
        # Verify raw benchmark results
        assert data["raw"]["avgMs"] > 0
        assert data["raw"]["p95Ms"] > 0
        assert data["raw"]["responseSizeBytes"] > 0
        
        # Verify parsed benchmark results
        assert data["parsed"]["avgMs"] > 0
        assert data["parsed"]["p95Ms"] > 0
        assert data["parsed"]["responseSizeBytes"] > 0
        
        # Verify team bulk results
        assert data["teamBulk"]["memberCount"] == 2
        assert data["teamBulk"]["raw"]["avgMs"] > 0
        assert data["teamBulk"]["parsed"]["avgMs"] > 0
        
        # Verify cache results
        assert data["cache"]["warmCacheAvgMs"] > 0
        assert data["cache"]["coldCacheAvgMs"] > 0
    
    def test_benchmark_no_test_data(self, client, share_dir):
        """Test benchmark endpoint when no test data is available."""
        # Share dir exists but is empty
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 503
        data = response.json()
        
        assert "error" in data
        assert data["error"] == "no_test_data"
        assert "message" in data
        assert "details" in data
    
    def test_benchmark_only_user_file(self, client, share_dir):
        """Test benchmark endpoint with only user file, no team."""
        # Create just a user file
        user_file = share_dir / "testuser.hday"
        user_file.write_text("2025/01/15 # Test\n", encoding="utf-8")
        
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 503
        data = response.json()
        assert data["error"] == "no_test_data"
    
    def test_benchmark_only_team(self, client, share_dir):
        """Test benchmark endpoint with only team, no user files."""
        # Create team config but no .hday files
        config_dir = share_dir / "config"
        config_dir.mkdir()

        config_path = config_dir / "team1.conf"
        config_path.write_text("groupname=Test Team\n", encoding="utf-8")

        people_path = config_dir / "team1.people"
        people_path.write_text("alice, Alice\n", encoding="utf-8")
        
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 503
        data = response.json()
        assert data["error"] == "no_test_data"
    
    def test_benchmark_incomplete_team(self, client, share_dir):
        """Test benchmark endpoint with incomplete team (missing config)."""
        # Create user file
        user_file = share_dir / "testuser.hday"
        user_file.write_text("2025/01/15 # Test\n", encoding="utf-8")
        
        # Create incomplete team config (missing .conf)
        config_dir = share_dir / "config"
        config_dir.mkdir()
        people_path = config_dir / "team1.people"
        people_path.write_text("alice, Alice\n", encoding="utf-8")
        
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 503
        data = response.json()
        assert data["error"] == "no_test_data"
    
    def test_benchmark_share_dir_not_exists(self, client, tmp_path, monkeypatch):
        """Test benchmark endpoint when share directory doesn't exist."""
        non_existent = tmp_path / "nonexistent"
        monkeypatch.setattr(settings, "SHARE_DIR", str(non_existent))
        
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 503
        data = response.json()
        assert "error" in data
    
    def test_benchmark_user_file_deleted_during_execution(
        self, client, test_data, share_dir
    ):
        """Test benchmark endpoint when user file is deleted during execution."""
        username, team_id = test_data
        
        # Mock the benchmark service to simulate file deletion
        from unittest.mock import patch
        from app.services import benchmark_service
        from app.services.hday_service import HdayFileNotFoundError
        
        def mock_benchmark_individual_file(*args, **kwargs):
            raise HdayFileNotFoundError("File was deleted")
        
        with patch.object(
            benchmark_service,
            'benchmark_individual_file',
            side_effect=mock_benchmark_individual_file
        ):
            response = client.get("/api/debug/benchmark")
            
            assert response.status_code == 503
            data = response.json()
            assert data["error"] == "benchmark_failed"
    
    def test_benchmark_response_size_reasonable(self, client, test_data):
        """Test that benchmark response size is reasonable."""
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 200
        data = response.json()
        
        # Response sizes should be reasonable (not negative, not huge)
        assert 0 < data["raw"]["responseSizeBytes"] < 1_000_000  # Less than 1MB
        assert 0 < data["parsed"]["responseSizeBytes"] < 1_000_000
        assert 0 < data["teamBulk"]["raw"]["responseSizeBytes"] < 10_000_000  # Less than 10MB
        assert 0 < data["teamBulk"]["parsed"]["responseSizeBytes"] < 10_000_000
    
    def test_benchmark_timing_reasonable(self, client, test_data):
        """Test that benchmark timings are reasonable."""
        response = client.get("/api/debug/benchmark")
        
        assert response.status_code == 200
        data = response.json()
        
        # Timings should be positive and reasonable (less than 10 seconds per operation)
        assert 0 < data["raw"]["avgMs"] < 10000
        assert 0 < data["parsed"]["avgMs"] < 10000
        assert 0 < data["teamBulk"]["raw"]["avgMs"] < 10000
        assert 0 < data["teamBulk"]["parsed"]["avgMs"] < 10000
        assert 0 < data["cache"]["warmCacheAvgMs"] < 10000
        assert 0 < data["cache"]["coldCacheAvgMs"] < 10000


class TestDebugRouterRegistration:
    """Tests for debug router conditional registration."""
    
    def test_debug_router_registered_in_development(self, monkeypatch, tmp_path):
        """Test that debug router is registered in development environment."""
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")
        
        # Use isolated empty share directory
        share = tmp_path / "share"
        share.mkdir()
        monkeypatch.setattr(settings, "SHARE_DIR", str(share))
        
        # Import fresh app to trigger registration
        from importlib import reload
        from app import main
        reload(main)
        
        client = TestClient(main.app)
        
        # The /debug/benchmark endpoint should be available
        # Even though it will fail without data, it should be registered
        response = client.get("/api/debug/benchmark")
        
        # Should not be 404 (not found), should be 503 (no data) since we have no test data
        assert response.status_code == 503
    
    def test_debug_router_not_registered_in_production(self, monkeypatch, tmp_path):
        """Test that debug router is NOT registered in production environment."""
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        
        # Create share dir to avoid startup warnings
        share = tmp_path / "share"
        share.mkdir()
        monkeypatch.setattr(settings, "SHARE_DIR", str(share))
        
        # Import fresh app to trigger registration
        from importlib import reload
        from app import main
        reload(main)
        
        client = TestClient(main.app)
        
        # The /debug/benchmark endpoint should NOT be available
        response = client.get("/api/debug/benchmark")
        
        # Should be 404 (not found) in production
        assert response.status_code == 404
