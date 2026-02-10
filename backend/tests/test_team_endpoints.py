"""Tests for team API endpoints."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

# Expected etag length: "sha256:" (7 chars) + 64 hex characters = 71
EXPECTED_SHA256_ETAG_LENGTH = 71


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory for testing."""
    share = tmp_path / "share"
    share.mkdir()
    monkeypatch.setattr(settings, "SHARE_DIR", str(share))
    return share


class TestGetTeamInfoEndpoint:
    """Tests for GET /v1/team/{team_id} endpoint."""

    def test_get_team_info_success(self, client, share_dir):
        """Test successful retrieval of team info."""
        # Create team directory with config and people files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text(
            "jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8"
        )

        response = client.get("/v1/team/team1")

        assert response.status_code == 200
        data = response.json()
        assert data["team_id"] == "team1"
        assert data["name"] == "Engineering Team"
        assert len(data["members"]) == 2
        assert data["members"][0]["username"] == "jdoe"
        assert data["members"][0]["display_name"] == "John Doe"
        assert data["members"][1]["username"] == "asmith"
        assert data["members"][1]["display_name"] == "Alice Smith"

    def test_get_team_info_with_whitespace_in_config(self, client, share_dir):
        """Test team info with whitespace in config is stripped."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("  Engineering Team  \n", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")

        response = client.get("/v1/team/team1")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Engineering Team"

    def test_get_team_info_team_not_found(self, client, share_dir):
        """Test GET returns 404 when team doesn't exist."""
        response = client.get("/v1/team/nonexistent")

        assert response.status_code == 404
        data = response.json()
        assert "Team not found" in data["detail"]

    def test_get_team_info_config_missing(self, client, share_dir):
        """Test GET returns 404 when config file is missing."""
        # Create team directory but no config file
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")

        response = client.get("/v1/team/team1")

        assert response.status_code == 404
        data = response.json()
        assert "Team configuration not found" in data["detail"]

    def test_get_team_info_people_missing(self, client, share_dir):
        """Test GET returns 404 when people file is missing."""
        # Create team directory and config but no people file
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")

        response = client.get("/v1/team/team1")

        assert response.status_code == 404
        data = response.json()
        assert "Team members file not found" in data["detail"]

    def test_get_team_info_share_not_accessible(self, client, tmp_path, monkeypatch):
        """Test GET returns 503 when share directory is not accessible."""
        # Use a non-existent directory
        monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path / "nonexistent"))

        response = client.get("/v1/team/team1")

        # When share directory doesn't exist, we get 503
        assert response.status_code == 503
        data = response.json()
        assert "not accessible" in data["detail"]

    def test_get_team_info_rejects_path_traversal(self, client, share_dir):
        """Test GET rejects path traversal attempts."""
        # FastAPI normalizes the path, so "../etc" becomes "..%2Fetc" in the URL
        # or gets normalized before reaching our handler
        response = client.get("/v1/team/../etc")

        # FastAPI's routing may return 404 Not Found for invalid paths
        assert response.status_code == 404

    def test_get_team_info_rejects_absolute_path(self, client, share_dir):
        """Test GET rejects absolute path attempts."""
        response = client.get("/v1/team//etc/passwd")

        assert response.status_code == 404

    def test_get_team_info_empty_members_list(self, client, share_dir):
        """Test GET handles empty members list."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("", encoding="utf-8")

        response = client.get("/v1/team/team1")

        assert response.status_code == 200
        data = response.json()
        assert data["team_id"] == "team1"
        assert data["name"] == "Engineering Team"
        assert len(data["members"]) == 0


class TestGetTeamHdayEndpoint:
    """Tests for GET /v1/team/{team_id}/hday endpoint."""

    def test_get_team_hday_all_files_exist(self, client, share_dir):
        """Test successful retrieval of all team members' .hday data."""
        # Create team directory with config and people files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text(
            "jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8"
        )
        
        # Create .hday files for both members
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # Vacation\n", encoding="utf-8")
        
        asmith_hday = team_dir / "asmith.hday"
        asmith_hday.write_text("2025/02/20 # Conference\n", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert data["team_id"] == "team1"
        assert len(data["members"]) == 2
        
        # Check first member
        assert data["members"][0]["username"] == "jdoe"
        assert data["members"][0]["display_name"] == "John Doe"
        assert data["members"][0]["raw"] == "2025/01/15 # Vacation\n"
        assert len(data["members"][0]["events"]) == 1
        assert data["members"][0]["etag"] is not None
        assert data["members"][0]["etag"].startswith("sha256:")
        assert len(data["members"][0]["etag"]) == EXPECTED_SHA256_ETAG_LENGTH
        
        # Check second member
        assert data["members"][1]["username"] == "asmith"
        assert data["members"][1]["display_name"] == "Alice Smith"
        assert data["members"][1]["raw"] == "2025/02/20 # Conference\n"
        assert len(data["members"][1]["events"]) == 1
        assert data["members"][1]["etag"] is not None

    def test_get_team_hday_some_files_missing(self, client, share_dir):
        """Test retrieval when some .hday files are missing."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text(
            "jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8"
        )
        
        # Create .hday file only for first member
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # Vacation\n", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 2
        
        # First member has data
        assert data["members"][0]["username"] == "jdoe"
        assert data["members"][0]["raw"] == "2025/01/15 # Vacation\n"
        assert data["members"][0]["etag"] is not None
        
        # Second member has empty data
        assert data["members"][1]["username"] == "asmith"
        assert data["members"][1]["raw"] == ""
        assert data["members"][1]["events"] == []
        assert data["members"][1]["etag"] is None

    def test_get_team_hday_all_files_missing(self, client, share_dir):
        """Test retrieval when all .hday files are missing."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text(
            "jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8"
        )

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 2
        
        # Both members have empty data
        for member in data["members"]:
            assert member["raw"] == ""
            assert member["events"] == []
            assert member["etag"] is None

    def test_get_team_hday_empty_file(self, client, share_dir):
        """Test retrieval with empty .hday file."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")
        
        # Create empty .hday file
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 1
        assert data["members"][0]["username"] == "jdoe"
        assert data["members"][0]["raw"] == ""
        assert data["members"][0]["events"] == []
        assert data["members"][0]["etag"] is not None  # Empty file still has etag

    def test_get_team_hday_with_multiple_events(self, client, share_dir):
        """Test retrieval with multiple events in .hday file."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")
        
        # Create .hday file with multiple events
        hday_content = """2025/01/15 # Vacation
2025/02/20-2025/02/22 # Conference
d1 # Every Monday
"""
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text(hday_content, encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 1
        assert data["members"][0]["username"] == "jdoe"
        assert len(data["members"][0]["events"]) == 3
        assert data["members"][0]["events"][0]["type"] == "range"
        assert data["members"][0]["events"][1]["type"] == "range"
        assert data["members"][0]["events"][2]["type"] == "weekly"

    def test_get_team_hday_team_not_found(self, client, share_dir):
        """Test GET returns 404 when team doesn't exist."""
        response = client.get("/v1/team/nonexistent/hday")

        assert response.status_code == 404
        data = response.json()
        assert "Team not found" in data["detail"]

    def test_get_team_hday_people_missing(self, client, share_dir):
        """Test GET returns 404 when people file is missing."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 404
        data = response.json()
        assert "Team members file not found" in data["detail"]

    def test_get_team_hday_share_not_accessible(self, client, tmp_path, monkeypatch):
        """Test GET returns 503 when share directory is not accessible."""
        monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path / "nonexistent"))

        response = client.get("/v1/team/team1/hday")

        # When share directory doesn't exist, we get 503
        assert response.status_code == 503
        data = response.json()
        assert "not accessible" in data["detail"]

    def test_get_team_hday_rejects_path_traversal(self, client, share_dir):
        """Test GET rejects path traversal attempts."""
        # FastAPI normalizes the path, so "../etc" becomes "..%2Fetc" in the URL
        # or gets normalized before reaching our handler
        response = client.get("/v1/team/../etc/hday")

        # FastAPI's routing may return 404 Not Found for invalid paths
        assert response.status_code == 404

    def test_get_team_hday_no_members(self, client, share_dir):
        """Test GET handles empty members list."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert data["team_id"] == "team1"
        assert len(data["members"]) == 0

    def test_get_team_hday_with_unicode_content(self, client, share_dir):
        """Test GET works with Unicode content in .hday files."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")
        
        # Create .hday file with Unicode content
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # 휴가일 (vacation)\n", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert data["members"][0]["raw"] == "2025/01/15 # 휴가일 (vacation)\n"
