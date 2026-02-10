"""Tests for audit logging module."""

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.audit import logger as audit_logger


@pytest.fixture
def temp_audit_dir(tmp_path, monkeypatch):
    """Create a temporary audit log directory."""
    audit_dir = tmp_path / "audit"
    audit_file = audit_dir / "audit.log"
    
    # Patch the module-level constants
    monkeypatch.setattr(audit_logger, "AUDIT_LOG_DIR", audit_dir)
    monkeypatch.setattr(audit_logger, "AUDIT_LOG_FILE", audit_file)
    
    return audit_dir, audit_file


def test_audit_append_basic(temp_audit_dir):
    """Test basic audit log append."""
    audit_dir, audit_file = temp_audit_dir
    
    # Append an audit entry
    audit_logger.append("test.hday", "read", "test details")
    
    # Verify directory was created
    assert audit_dir.exists()
    assert audit_file.exists()
    
    # Read and verify log entry
    with open(audit_file, "r", encoding="utf-8") as f:
        line = f.readline()
        entry = json.loads(line)
    
    assert entry["target"] == "test.hday"
    assert entry["action"] == "read"
    assert entry["details"] == "test details"
    assert "ts" in entry
    
    # Verify timestamp is valid ISO 8601
    timestamp = datetime.fromisoformat(entry["ts"].replace("Z", "+00:00"))
    assert timestamp.tzinfo is not None


def test_audit_append_without_details(temp_audit_dir):
    """Test audit log append without details."""
    audit_dir, audit_file = temp_audit_dir
    
    # Append an audit entry without details
    audit_logger.append("user123.hday", "delete")
    
    # Read and verify log entry
    with open(audit_file, "r", encoding="utf-8") as f:
        line = f.readline()
        entry = json.loads(line)
    
    assert entry["target"] == "user123.hday"
    assert entry["action"] == "delete"
    assert entry["details"] is None


def test_audit_append_multiple_entries(temp_audit_dir):
    """Test multiple audit log entries."""
    audit_dir, audit_file = temp_audit_dir
    
    # Append multiple entries
    audit_logger.append("file1.hday", "read", "first")
    audit_logger.append("file2.hday", "write", "second")
    audit_logger.append("file3.hday", "delete", "third")
    
    # Read and verify all entries
    with open(audit_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    assert len(lines) == 3
    
    entry1 = json.loads(lines[0])
    assert entry1["target"] == "file1.hday"
    assert entry1["action"] == "read"
    assert entry1["details"] == "first"
    
    entry2 = json.loads(lines[1])
    assert entry2["target"] == "file2.hday"
    assert entry2["action"] == "write"
    assert entry2["details"] == "second"
    
    entry3 = json.loads(lines[2])
    assert entry3["target"] == "file3.hday"
    assert entry3["action"] == "delete"
    assert entry3["details"] == "third"


def test_audit_append_unicode(temp_audit_dir):
    """Test audit log with Unicode characters."""
    audit_dir, audit_file = temp_audit_dir
    
    # Append entry with Unicode characters
    audit_logger.append("ユーザー.hday", "read", "Détails spéciaux 中文")
    
    # Read and verify Unicode handling
    with open(audit_file, "r", encoding="utf-8") as f:
        line = f.readline()
        entry = json.loads(line)
    
    assert entry["target"] == "ユーザー.hday"
    assert entry["action"] == "read"
    assert entry["details"] == "Détails spéciaux 中文"


def test_audit_append_creates_directory(temp_audit_dir):
    """Test that audit append creates directory if it doesn't exist."""
    audit_dir, audit_file = temp_audit_dir
    
    # Remove the directory to test creation
    if audit_dir.exists():
        audit_dir.rmdir()
    
    # Append should create the directory
    audit_logger.append("test.hday", "read")
    
    # Verify directory and file were created
    assert audit_dir.exists()
    assert audit_file.exists()


def test_audit_log_format(temp_audit_dir):
    """Test that audit log entries have correct JSON format."""
    audit_dir, audit_file = temp_audit_dir
    
    audit_logger.append("test.hday", "read", "details")
    
    # Read raw line
    with open(audit_file, "r", encoding="utf-8") as f:
        line = f.readline()
    
    # Verify line ends with newline
    assert line.endswith("\n")
    
    # Verify it's valid JSON
    entry = json.loads(line.strip())
    
    # Verify all required fields
    assert "ts" in entry
    assert "target" in entry
    assert "action" in entry
    assert "details" in entry


def test_audit_timestamp_format(temp_audit_dir):
    """Test that timestamps are in UTC ISO 8601 format."""
    audit_dir, audit_file = temp_audit_dir
    
    before = datetime.now(timezone.utc)
    audit_logger.append("test.hday", "read")
    after = datetime.now(timezone.utc)
    
    with open(audit_file, "r", encoding="utf-8") as f:
        entry = json.loads(f.readline())
    
    # Parse timestamp
    ts_str = entry["ts"]
    timestamp = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    
    # Verify timestamp is between before and after
    assert before <= timestamp <= after
    
    # Verify timestamp has timezone info
    assert timestamp.tzinfo is not None


def test_audit_append_permission_error(temp_audit_dir, monkeypatch):
    """Test that permission errors are raised."""
    audit_dir, audit_file = temp_audit_dir
    
    # Create directory with no write permissions (Unix only)
    audit_dir.mkdir(parents=True, exist_ok=True)
    
    # Mock mkdir to raise PermissionError
    original_mkdir = Path.mkdir
    
    def mock_mkdir(self, *args, **kwargs):
        if str(self) == str(audit_dir):
            raise PermissionError("No write permission")
        return original_mkdir(self, *args, **kwargs)
    
    monkeypatch.setattr(Path, "mkdir", mock_mkdir)
    
    # Should raise PermissionError
    with pytest.raises(PermissionError):
        audit_logger.append("test.hday", "read")
