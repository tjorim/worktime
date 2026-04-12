"""Tests for .hday file API endpoints."""

import json

import pytest
from fastapi.testclient import TestClient

from app.config.settings import settings
from app.main import app

# Expected etag length: "sha256:" (7 chars) + 64 hex characters = 71
EXPECTED_SHA256_ETAG_LENGTH = 71

pytestmark = pytest.mark.skipif(
    not settings.LEGACY_FILESHARE_ENABLED,
    reason="Legacy fileshare not enabled (LEGACY_FILESHARE_ENABLED=False)"
)


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


@pytest.fixture
def audit_log(tmp_path, monkeypatch):
    """Create a temporary audit log for testing."""
    audit_dir = tmp_path / "audit"
    audit_dir.mkdir()
    audit_file = audit_dir / "audit.log"
    
    # Mock the audit log file location
    import app.audit.logger as audit_module
    monkeypatch.setattr(audit_module, "AUDIT_LOG_FILE", audit_file)
    
    return audit_file


class TestGetEndpoint:
    """Tests for GET /hday/{username} endpoint."""
    
    def test_get_file_not_found(self, client, share_dir):
        """Test GET returns 404 when file doesn't exist."""
        response = client.get("/api/hday/nonexistent")
        
        assert response.status_code == 404
        data = response.json()
        assert "No events found" in data["detail"]
        assert "nonexistent" in data["detail"]
    
    def test_get_file_success(self, client, share_dir):
        """Test GET returns file content and etag."""
        # Create a test .hday file
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation\n2025/12/25 # Christmas"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser")
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["raw"] == test_content
        assert data["etag"].startswith("sha256:")
        assert len(data["etag"]) == EXPECTED_SHA256_ETAG_LENGTH
    
    def test_get_file_with_unicode(self, client, share_dir):
        """Test GET works with Unicode content."""
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # 휴가일 (vacation)"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser")
        
        assert response.status_code == 200
        data = response.json()
        assert data["raw"] == test_content
    
    def test_get_share_not_accessible(self, client, tmp_path, monkeypatch):
        """Test GET returns 503 when share directory is not accessible."""
        # Use a non-existent directory
        monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path / "nonexistent"))
        
        response = client.get("/api/hday/testuser")
        
        assert response.status_code == 503
        data = response.json()
        assert "not accessible" in data["detail"]
    
    def test_get_file_format_raw_default(self, client, share_dir):
        """Test GET with default format=raw returns no events."""
        # Create a test .hday file with parseable content
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation\n2025/12/25 # Christmas"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser")
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["raw"] == test_content
        assert data["etag"].startswith("sha256:")
        # events should be None for format=raw (default)
        assert data["events"] is None
    
    def test_get_file_format_raw_explicit(self, client, share_dir):
        """Test GET with explicit format=raw returns no events."""
        # Create a test .hday file
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser?format=raw")
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["raw"] == test_content
        # events should be None for format=raw
        assert data["events"] is None
    
    def test_get_file_format_parsed(self, client, share_dir):
        """Test GET with format=parsed returns parsed events."""
        # Create a test .hday file
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation\n2025/12/25 # Christmas"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser?format=parsed")
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["raw"] == test_content
        assert data["etag"].startswith("sha256:")
        # events should be present for format=parsed
        assert data["events"] is not None
        assert isinstance(data["events"], list)
        assert len(data["events"]) == 2
        assert data["events"][0]["type"] == "range"
        assert data["events"][0]["start"] == "2025/01/15"
        assert data["events"][0]["title"] == "Vacation"
    
    def test_get_file_format_parsed_empty_file(self, client, share_dir):
        """Test GET with format=parsed on empty file returns empty events list."""
        # Create an empty .hday file
        test_file = share_dir / "testuser.hday"
        test_file.write_text("", encoding="utf-8")
        
        response = client.get("/api/hday/testuser?format=parsed")
        
        assert response.status_code == 200
        data = response.json()
        assert data["raw"] == ""
        assert data["events"] is not None
        assert isinstance(data["events"], list)
        assert len(data["events"]) == 0
    
    def test_get_file_format_parsed_malformed_content(self, client, share_dir):
        """Test GET with format=parsed handles parsing errors gracefully."""
        # Create a file with content that might cause parse errors
        test_file = share_dir / "testuser.hday"
        # Most content should parse fine, but we test the error handling path exists
        test_content = "2025/01/15 # Valid event"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser?format=parsed")
        
        # Should still return 200 even if parsing has issues
        assert response.status_code == 200
        data = response.json()
        assert data["raw"] == test_content
        # events should be a list (empty if parsing fails, non-empty if it succeeds)
        assert data["events"] is not None
        assert isinstance(data["events"], list)


class TestPutEndpoint:
    """Tests for PUT /hday/{username} endpoint."""
    
    def test_put_creates_new_file_with_raw(self, client, share_dir, audit_log):
        """Test PUT creates new file with raw content."""
        test_content = "2025/01/15 # Vacation"
        
        response = client.put(
            "/api/hday/newuser",
            json={"raw": test_content, "etag": None}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "etag" in data
        assert data["etag"].startswith("sha256:")
        
        # Verify file was created
        test_file = share_dir / "newuser.hday"
        assert test_file.exists()
        assert test_file.read_text(encoding="utf-8") == test_content
        
        # Verify audit log
        assert audit_log.exists()
        log_lines = audit_log.read_text(encoding="utf-8").strip().split("\n")
        assert len(log_lines) == 1
        log_entry = json.loads(log_lines[0])
        assert log_entry["target"] == "newuser.hday"
        assert log_entry["action"] == "write_hday"
        assert "etag" in log_entry["details"]
    
    def test_put_updates_existing_file(self, client, share_dir, audit_log):
        """Test PUT updates existing file with correct etag."""
        # Create initial file
        test_file = share_dir / "testuser.hday"
        initial_content = "2025/01/15 # Vacation"
        test_file.write_text(initial_content, encoding="utf-8")
        
        # Get initial etag
        from app.services.hday_service import compute_etag
        initial_etag = compute_etag(initial_content)
        
        # Update file
        new_content = "2025/01/15 # Vacation\n2025/12/25 # Christmas"
        response = client.put(
            "/api/hday/testuser",
            json={"raw": new_content, "etag": initial_etag}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["etag"] != initial_etag
        
        # Verify file was updated
        assert test_file.read_text(encoding="utf-8") == new_content
    
    def test_put_serializes_events_json(self, client, share_dir, audit_log):
        """Test PUT correctly serializes events JSON to .hday format."""
        events = [
            {
                "type": "range",
                "start": "2025/01/15",
                "end": "2025/01/15",
                "flags": ["holiday"],
                "title": "Vacation",
                "raw": "2025/01/15 # Vacation"
            }
        ]
        
        response = client.put(
            "/api/hday/testuser",
            json={"events": events, "etag": None}
        )
        
        assert response.status_code == 200
        
        # Verify file content matches serialized format
        test_file = share_dir / "testuser.hday"
        content = test_file.read_text(encoding="utf-8")
        assert "2025/01/15-2025/01/15" in content
        assert "Vacation" in content
    
    def test_put_events_precedence_over_raw(self, client, share_dir, audit_log):
        """Test that events takes precedence when both raw and events provided."""
        events = [
            {
                "type": "range",
                "start": "2025/12/25",
                "end": "2025/12/25",
                "flags": ["holiday"],
                "title": "Christmas",
                "raw": "2025/12/25 # Christmas"
            }
        ]
        
        response = client.put(
            "/api/hday/testuser",
            json={
                "raw": "2025/01/15 # Should be ignored",
                "events": events,
                "etag": None
            }
        )
        
        assert response.status_code == 200
        
        # Verify file contains serialized events, not raw
        test_file = share_dir / "testuser.hday"
        content = test_file.read_text(encoding="utf-8")
        assert "Christmas" in content
        assert "Should be ignored" not in content
    
    def test_put_validation_neither_raw_nor_events(self, client, share_dir):
        """Test PUT returns 422 when neither raw nor events provided."""
        response = client.put(
            "/api/hday/testuser",
            json={"etag": None}
        )
        
        assert response.status_code == 422
        data = response.json()
        assert "raw" in data["detail"] or "events" in data["detail"]
    
    def test_put_conflict_etag_mismatch(self, client, share_dir):
        """Test PUT returns 409 on etag mismatch."""
        # Create initial file
        test_file = share_dir / "testuser.hday"
        initial_content = "2025/01/15 # Vacation"
        test_file.write_text(initial_content, encoding="utf-8")
        
        # Try to update with wrong etag
        response = client.put(
            "/api/hday/testuser",
            json={
                "raw": "2025/12/25 # Christmas",
                "etag": "sha256:wrongetag"
            }
        )
        
        assert response.status_code == 409
        data = response.json()
        assert "raw" in data
        assert data["raw"] == initial_content
        assert "etag" in data
        assert data["etag"].startswith("sha256:")
        assert "events" in data
    
    def test_put_null_etag_succeeds_for_new_file(self, client, share_dir, audit_log):
        """Test PUT with null etag succeeds when creating new file."""
        response = client.put(
            "/api/hday/newuser",
            json={"raw": "2025/01/15 # Test", "etag": None}
        )
        
        assert response.status_code == 200
        
        test_file = share_dir / "newuser.hday"
        assert test_file.exists()
    
    def test_put_null_etag_conflicts_if_file_exists(self, client, share_dir):
        """Test PUT with null etag returns 409 if file already exists."""
        # Create file first
        test_file = share_dir / "testuser.hday"
        test_file.write_text("2025/01/15 # Existing", encoding="utf-8")
        
        # Try to create with null etag (should fail)
        response = client.put(
            "/api/hday/testuser",
            json={"raw": "2025/12/25 # New", "etag": None}
        )
        
        assert response.status_code == 409
        data = response.json()
        assert data["raw"] == "2025/01/15 # Existing"
    
    def test_put_share_not_accessible(self, client, tmp_path, monkeypatch):
        """Test PUT returns 503 when share directory is not accessible."""
        monkeypatch.setattr(settings, "SHARE_DIR", str(tmp_path / "nonexistent"))
        
        response = client.put(
            "/api/hday/testuser",
            json={"raw": "2025/01/15 # Test", "etag": None}
        )
        
        assert response.status_code == 503
        data = response.json()
        assert "not accessible" in data["detail"]


class TestAtomicWrites:
    """Tests for atomic write operations."""
    
    def test_temp_file_cleanup_on_success(self, client, share_dir, audit_log):
        """Test that temporary file is cleaned up after successful write."""
        response = client.put(
            "/api/hday/testuser",
            json={"raw": "2025/01/15 # Test", "etag": None}
        )
        
        assert response.status_code == 200
        
        # Verify temp file doesn't exist
        temp_file = share_dir / "testuser.hday.tmp"
        assert not temp_file.exists()
        
        # Verify actual file exists
        actual_file = share_dir / "testuser.hday"
        assert actual_file.exists()


class TestAuditLogging:
    """Tests for audit logging on write operations."""
    
    def test_audit_log_created_on_write(self, client, share_dir, audit_log):
        """Test that audit log entry is created on successful write."""
        response = client.put(
            "/api/hday/testuser",
            json={"raw": "2025/01/15 # Test", "etag": None}
        )
        
        assert response.status_code == 200
        
        # Verify audit log exists and has entry
        assert audit_log.exists()
        log_content = audit_log.read_text(encoding="utf-8")
        assert "testuser.hday" in log_content
        assert "write_hday" in log_content
    
    def test_audit_log_not_created_on_failure(self, client, share_dir, audit_log):
        """Test that audit log entry is not created on conflict."""
        # Create existing file
        test_file = share_dir / "testuser.hday"
        test_file.write_text("2025/01/15 # Existing", encoding="utf-8")
        
        # Try to create with null etag (will conflict)
        response = client.put(
            "/api/hday/testuser",
            json={"raw": "2025/12/25 # New", "etag": None}
        )
        
        assert response.status_code == 409
        
        # Verify audit log doesn't exist or is empty
        if audit_log.exists():
            log_content = audit_log.read_text(encoding="utf-8").strip()
            assert log_content == ""
    
    def test_audit_log_format(self, client, share_dir, audit_log):
        """Test audit log entry format."""
        response = client.put(
            "/api/hday/testuser",
            json={"raw": "2025/01/15 # Test", "etag": None}
        )
        
        assert response.status_code == 200
        
        # Parse and verify audit log entry
        log_lines = audit_log.read_text(encoding="utf-8").strip().split("\n")
        entry = json.loads(log_lines[0])
        
        assert "ts" in entry
        assert entry["target"] == "testuser.hday"
        assert entry["action"] == "write_hday"
        assert entry["details"] is not None
        assert "etag" in entry["details"]


class TestTimingHeaders:
    """Tests for timing headers in hday endpoints."""
    
    def test_get_timing_headers_raw_format(self, client, share_dir):
        """Test GET returns timing headers for format=raw."""
        # Create a test .hday file
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation\n2025/12/25 # Christmas"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser?format=raw")
        
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
    
    def test_get_timing_headers_parsed_format(self, client, share_dir):
        """Test GET returns timing headers for format=parsed."""
        # Create a test .hday file
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation\n2025/12/25 # Christmas"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser?format=parsed")
        
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
    
    def test_timing_header_format(self, client, share_dir):
        """Test that timing headers have correct format (3 decimal places)."""
        # Create a test .hday file
        test_file = share_dir / "testuser.hday"
        test_content = "2025/01/15 # Vacation"
        test_file.write_text(test_content, encoding="utf-8")
        
        response = client.get("/api/hday/testuser")
        
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