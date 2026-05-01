"""Tests for health check endpoints."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.routers.health import _get_db_if_enabled


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


@pytest.fixture
def readiness_client(client):
    """Test client with DB dependency override and SuperTokens mock applied."""
    async def mock_db():
        yield AsyncMock()

    app.dependency_overrides[_get_db_if_enabled] = mock_db

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_http_client = AsyncMock()
    mock_http_client.get = AsyncMock(return_value=mock_response)
    mock_http_ctx = MagicMock()
    mock_http_ctx.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_http_ctx.__aexit__ = AsyncMock(return_value=None)

    with patch("app.routers.health.httpx.AsyncClient", return_value=mock_http_ctx):
        yield client

    del app.dependency_overrides[_get_db_if_enabled]


# ---------------------------------------------------------------------------
# Liveness endpoint
# ---------------------------------------------------------------------------


def test_liveness_returns_200(client):
    """GET /api/health/liveness always returns 200 with no external I/O."""
    response = client.get("/api/health/liveness")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


# ---------------------------------------------------------------------------
# Health summary endpoint
# ---------------------------------------------------------------------------


def test_health_summary_returns_200_with_links(client):
    """GET /api/health returns 200 with links to liveness and readiness."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["links"]["liveness"] == "/api/health/liveness"
    assert data["links"]["readiness"] == "/api/health/readiness"


# ---------------------------------------------------------------------------
# Readiness endpoint
# ---------------------------------------------------------------------------


def test_readiness_check_success(readiness_client, tmp_path, monkeypatch):
    """Test readiness check when share directory is accessible."""
    share_dir = tmp_path / "share"
    share_dir.mkdir()
    (share_dir / "test.txt").write_text("test")

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["auth"] == "ok"
    assert data["database"] == "ok"
    assert data["share"] == "ok"


def test_readiness_check_directory_not_found(readiness_client, tmp_path, monkeypatch):
    """Test readiness check when share directory does not exist."""
    share_dir = tmp_path / "nonexistent"

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"


def test_readiness_check_not_a_directory(readiness_client, tmp_path, monkeypatch):
    """Test readiness check when share path is a file, not a directory."""
    share_file = tmp_path / "sharefile"
    share_file.write_text("not a directory")

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_file))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "not_found"


def test_readiness_check_permission_denied(readiness_client, tmp_path, monkeypatch):
    """Test readiness check when permission is denied to read directory."""
    share_dir = tmp_path / "share"
    share_dir.mkdir()

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    original_iterdir = Path.iterdir

    def mock_iterdir(self):
        if str(self) == str(share_dir):
            raise PermissionError("Permission denied")
        return original_iterdir(self)

    monkeypatch.setattr(Path, "iterdir", mock_iterdir)

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "permission_denied"


def test_readiness_check_general_error(readiness_client, tmp_path, monkeypatch):
    """Test readiness check when a general error occurs."""
    share_dir = tmp_path / "share"
    share_dir.mkdir()

    monkeypatch.setattr(settings, "SHARE_DIR", str(share_dir))
    monkeypatch.setattr(settings, "LEGACY_FILESHARE_ENABLED", True)

    original_iterdir = Path.iterdir

    def mock_iterdir(self):
        if str(self) == str(share_dir):
            raise OSError("Disk error")
        return original_iterdir(self)

    monkeypatch.setattr(Path, "iterdir", mock_iterdir)

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["share"] == "error"
    assert "error" in data
    assert data["error"] == "internal_error"

