"""Tests for health check endpoint."""

import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

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

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    # Mock SuperTokens core and DB so they always succeed in unit tests.
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_http_client = AsyncMock()
    mock_http_client.get = AsyncMock(return_value=mock_response)
    mock_http_ctx = MagicMock()
    mock_http_ctx.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_http_ctx.__aexit__ = AsyncMock(return_value=None)

    mock_session = AsyncMock()
    mock_session_ctx = MagicMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=None)
    mock_factory = MagicMock(return_value=mock_session_ctx)

    with (
        patch("app.routers.health.httpx.AsyncClient", return_value=mock_http_ctx),
        patch("app.routers.health.get_session_factory", return_value=mock_factory),
    ):
        response = client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["share"] == "ok"


def test_health_check_directory_not_found(client, tmp_path, monkeypatch):
    """Test health check when share directory does not exist."""
    # Use a non-existent directory
    share_dir = tmp_path / "nonexistent"

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    response = client.get("/api/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"


def test_health_check_not_a_directory(client, tmp_path, monkeypatch):
    """Test health check when share path is a file, not a directory."""
    # Create a file instead of a directory
    share_file = tmp_path / "sharefile"
    share_file.write_text("not a directory")

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_file))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    response = client.get("/api/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"


def test_health_check_permission_denied(client, tmp_path, monkeypatch):
    """Test health check when permission is denied to read directory."""
    # Create a directory
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    # Mock iterdir to raise PermissionError
    original_iterdir = Path.iterdir
    
    def mock_iterdir(self):
        if str(self) == str(share_dir):
            raise PermissionError("Permission denied")
        return original_iterdir(self)
    
    monkeypatch.setattr(Path, "iterdir", mock_iterdir)
    
    response = client.get("/api/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "permission_denied"


def test_health_check_general_error(client, tmp_path, monkeypatch):
    """Test health check when a general error occurs."""
    # Create a directory
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    
    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    # Mock iterdir to raise a general exception
    original_iterdir = Path.iterdir
    
    def mock_iterdir(self):
        if str(self) == str(share_dir):
            raise OSError("Disk error")
        return original_iterdir(self)
    
    monkeypatch.setattr(Path, "iterdir", mock_iterdir)
    
    response = client.get("/api/health")
    
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "error"
    assert "error" in data
    # Error message is now generic for security (no information disclosure)
    assert data["error"] == "internal_error"


