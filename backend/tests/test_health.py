"""Tests for health check endpoint."""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


def test_health_check_success(client, tmp_path, monkeypatch):
    """Test health check when share directory is accessible."""
    # Create a temporary directory
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    
    # Create a test file to verify directory listing works
    (share_dir / "test.txt").write_text("test")
    
    # Mock the settings to use our temporary directory
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    
    response = client.get("/v1/health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["share"] == "accessible"


def test_health_check_directory_not_found(client, tmp_path, monkeypatch):
    """Test health check when share directory does not exist."""
    # Use a non-existent directory
    share_dir = tmp_path / "nonexistent"
    
    # Mock the settings to use our non-existent directory
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    
    response = client.get("/v1/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"


def test_health_check_not_a_directory(client, tmp_path, monkeypatch):
    """Test health check when share path is a file, not a directory."""
    # Create a file instead of a directory
    share_file = tmp_path / "sharefile"
    share_file.write_text("not a directory")
    
    # Mock the settings to use our file
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_file))
    
    response = client.get("/v1/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"


def test_health_check_permission_denied(client, tmp_path, monkeypatch):
    """Test health check when permission is denied to read directory."""
    # Create a directory
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    
    # Mock the settings to use our directory
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    
    # Mock iterdir to raise PermissionError
    original_iterdir = Path.iterdir
    
    def mock_iterdir(self):
        if str(self) == str(share_dir):
            raise PermissionError("Permission denied")
        return original_iterdir(self)
    
    monkeypatch.setattr(Path, "iterdir", mock_iterdir)
    
    response = client.get("/v1/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "permission_denied"


def test_health_check_general_error(client, tmp_path, monkeypatch):
    """Test health check when a general error occurs."""
    # Create a directory
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    
    # Mock the settings to use our directory
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    
    # Mock iterdir to raise a general exception
    original_iterdir = Path.iterdir
    
    def mock_iterdir(self):
        if str(self) == str(share_dir):
            raise OSError("Disk error")
        return original_iterdir(self)
    
    monkeypatch.setattr(Path, "iterdir", mock_iterdir)
    
    response = client.get("/v1/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "error"
    assert "error" in data
    assert "Disk error" in data["error"]


def test_healthz_alias(client, tmp_path, monkeypatch):
    """Test that /healthz is an alias for /v1/health."""
    # Create a temporary directory
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    
    # Mock the settings to use our temporary directory
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    
    response = client.get("/healthz")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["share"] == "accessible"


def test_healthz_alias_error(client, tmp_path, monkeypatch):
    """Test that /healthz alias properly propagates error states."""
    # Use a non-existent directory
    share_dir = tmp_path / "nonexistent"
    
    # Mock the settings to use our non-existent directory
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    
    response = client.get("/healthz")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"
