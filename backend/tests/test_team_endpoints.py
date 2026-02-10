"""Tests for team API endpoints."""

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

    def test_get_team_info_rejects_invalid_team_id(self, client, share_dir):
        """Test GET returns 400 for invalid team_id format."""
        # Test team_id with leading dot (invalid format that reaches our handler)
        response = client.get("/v1/team/.hidden")
        assert response.status_code == 400
        data = response.json()
        assert "Invalid team_id" in data["detail"]

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
        """Test successful retrieval of all team members' .hday data with default format=raw."""
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
        # Default format=raw means events should be empty list
        assert data["members"][0]["events"] == []
        assert data["members"][0]["etag"] is not None
        assert data["members"][0]["etag"].startswith("sha256:")
        assert len(data["members"][0]["etag"]) == EXPECTED_SHA256_ETAG_LENGTH
        
        # Check second member
        assert data["members"][1]["username"] == "asmith"
        assert data["members"][1]["display_name"] == "Alice Smith"
        assert data["members"][1]["raw"] == "2025/02/20 # Conference\n"
        # Default format=raw means events should be empty list
        assert data["members"][1]["events"] == []
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
        """Test retrieval with multiple events in .hday file using format=parsed."""
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

        # Use format=parsed to get parsed events
        response = client.get("/v1/team/team1/hday?format=parsed")

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

    def test_get_team_hday_rejects_invalid_team_id(self, client, share_dir):
        """Test GET returns 400 for invalid team_id format."""
        # Test team_id with leading dot (invalid format that reaches our handler)
        response = client.get("/v1/team/.hidden/hday")
        assert response.status_code == 400
        data = response.json()
        assert "Invalid team_id" in data["detail"]

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
    
    def test_get_team_hday_format_raw_default(self, client, share_dir):
        """Test GET with default format=raw returns parsed events (backward compatibility)."""
        # Create team directory with files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")
        
        # Create .hday file
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # Vacation\n", encoding="utf-8")

        response = client.get("/v1/team/team1/hday")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 1
        assert data["members"][0]["username"] == "jdoe"
        assert data["members"][0]["raw"] == "2025/01/15 # Vacation\n"
        # Default format=raw should return empty events list
        assert data["members"][0]["events"] == []
    
    def test_get_team_hday_format_raw_explicit(self, client, share_dir):
        """Test GET with explicit format=raw returns no parsed events."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\n", encoding="utf-8")
        
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # Vacation\n", encoding="utf-8")

        response = client.get("/v1/team/team1/hday?format=raw")

        assert response.status_code == 200
        data = response.json()
        assert data["members"][0]["events"] == []
    
    def test_get_team_hday_format_parsed(self, client, share_dir):
        """Test GET with format=parsed returns parsed events."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8")
        
        # Create .hday files
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # Vacation\n2025/12/25 # Christmas\n", encoding="utf-8")
        
        asmith_hday = team_dir / "asmith.hday"
        asmith_hday.write_text("2025/02/20 # Conference\n", encoding="utf-8")

        response = client.get("/v1/team/team1/hday?format=parsed")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 2
        
        # Check first member has parsed events
        assert data["members"][0]["username"] == "jdoe"
        assert len(data["members"][0]["events"]) == 2
        assert data["members"][0]["events"][0]["type"] == "range"
        assert data["members"][0]["events"][0]["start"] == "2025/01/15"
        assert data["members"][0]["events"][0]["title"] == "Vacation"
        
        # Check second member has parsed events
        assert data["members"][1]["username"] == "asmith"
        assert len(data["members"][1]["events"]) == 1
        assert data["members"][1]["events"][0]["start"] == "2025/02/20"
        assert data["members"][1]["events"][0]["title"] == "Conference"
    
    def test_get_team_hday_format_parsed_missing_files(self, client, share_dir):
        """Test GET with format=parsed handles missing files correctly."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8")
        
        # Only create file for first member
        jdoe_hday = team_dir / "jdoe.hday"
        jdoe_hday.write_text("2025/01/15 # Vacation\n", encoding="utf-8")
        # asmith.hday intentionally not created

        response = client.get("/v1/team/team1/hday?format=parsed")

        assert response.status_code == 200
        data = response.json()
        assert len(data["members"]) == 2
        
        # First member should have parsed event
        assert data["members"][0]["username"] == "jdoe"
        assert len(data["members"][0]["events"]) == 1
        
        # Second member should have empty data
        assert data["members"][1]["username"] == "asmith"
        assert data["members"][1]["raw"] == ""
        assert data["members"][1]["events"] == []
        assert data["members"][1]["etag"] is None


class TestTeamHdayTimingHeaders:
    """Tests for timing headers in team hday endpoints."""
    
    def test_team_hday_timing_headers_raw_format(self, client, share_dir):
        """Test team hday endpoint returns timing headers for format=raw."""
        # Create team directory with config, people, and .hday files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\nasmith,Alice Smith", encoding="utf-8")
        
        # Create .hday file for one member
        hday_file = team_dir / "jdoe.hday"
        hday_file.write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        response = client.get("/v1/team/team1/hday?format=raw")
        
        assert response.status_code == 200
        
        # Check timing headers are present
        assert "X-File-Read-Ms" in response.headers
        assert "X-Parse-Time-Ms" in response.headers
        assert "X-Total-Ms" in response.headers
        
        # Parse timing values
        file_read_ms = float(response.headers["X-File-Read-Ms"])
        parse_time_ms = float(response.headers["X-Parse-Time-Ms"])
        total_ms = float(response.headers["X-Total-Ms"])
        
        # All timings should be non-negative
        assert file_read_ms >= 0
        assert parse_time_ms == 0.0  # No parsing for raw format
        assert total_ms >= 0
        
        # Total should be greater than or equal to file_read
        assert total_ms >= file_read_ms
    
    def test_team_hday_timing_headers_parsed_format(self, client, share_dir):
        """Test team hday endpoint returns timing headers for format=parsed."""
        # Create team directory with config, people, and .hday files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\nasmith,Alice Smith", encoding="utf-8")
        
        # Create .hday file for one member
        hday_file = team_dir / "jdoe.hday"
        hday_file.write_text("2025/01/15 # Vacation", encoding="utf-8")
        
        response = client.get("/v1/team/team1/hday?format=parsed")
        
        assert response.status_code == 200
        
        # Check timing headers are present
        assert "X-File-Read-Ms" in response.headers
        assert "X-Parse-Time-Ms" in response.headers
        assert "X-Total-Ms" in response.headers
        
        # Parse timing values
        file_read_ms = float(response.headers["X-File-Read-Ms"])
        parse_time_ms = float(response.headers["X-Parse-Time-Ms"])
        total_ms = float(response.headers["X-Total-Ms"])
        
        # All timings should be non-negative
        assert file_read_ms >= 0
        assert parse_time_ms >= 0  # Parsing should have occurred
        assert total_ms >= 0
        
        # Total should include both file read and parse time
        assert total_ms >= file_read_ms
        assert total_ms >= parse_time_ms
    
    def test_team_hday_timing_header_format(self, client, share_dir):
        """Test that timing headers have correct format (3 decimal places)."""
        # Create team directory with config and people
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe", encoding="utf-8")
        
        response = client.get("/v1/team/team1/hday")
        
        assert response.status_code == 200
        
        # Check format of timing headers
        file_read_header = response.headers["X-File-Read-Ms"]
        parse_time_header = response.headers["X-Parse-Time-Ms"]
        total_header = response.headers["X-Total-Ms"]
        
        # All should have 3 decimal places
        assert "." in file_read_header
        assert len(file_read_header.split(".")[1]) == 3
        
        assert "." in parse_time_header
        assert len(parse_time_header.split(".")[1]) == 3
        
        assert "." in total_header
        assert len(total_header.split(".")[1]) == 3
    
    def test_team_hday_timing_with_multiple_members(self, client, share_dir):
        """Test timing headers with multiple team members and files."""
        # Create team directory with config, people, and multiple .hday files
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")
        
        people_file = team_dir / "people"
        people_file.write_text("jdoe,John Doe\nasmith,Alice Smith\nblee,Bob Lee", encoding="utf-8")
        
        # Create .hday files for multiple members
        (team_dir / "jdoe.hday").write_text("2025/01/15 # Vacation\n2025/12/25 # Holiday", encoding="utf-8")
        (team_dir / "asmith.hday").write_text("2025/02/10 # Day off", encoding="utf-8")
        (team_dir / "blee.hday").write_text("2025/03/01 # Conference", encoding="utf-8")
        
        response = client.get("/v1/team/team1/hday?format=parsed")
        
        assert response.status_code == 200
        
        # Verify timing headers are present
        assert "X-File-Read-Ms" in response.headers
        assert "X-Parse-Time-Ms" in response.headers
        assert "X-Total-Ms" in response.headers
        
        # Parse timing values
        file_read_ms = float(response.headers["X-File-Read-Ms"])
        parse_time_ms = float(response.headers["X-Parse-Time-Ms"])
        total_ms = float(response.headers["X-Total-Ms"])
        
        # With 3 members, file read and parse should take measurable time
        assert file_read_ms > 0
        assert parse_time_ms > 0
        assert total_ms >= file_read_ms + parse_time_ms
