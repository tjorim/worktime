"""Tests for health check endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import health as health_router
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

    # Mock OIDC provider reachability check.
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


def test_health_summary_returns_200_with_links(client, monkeypatch):
    """GET /api/health returns 200 with links to liveness and readiness."""
    monkeypatch.setattr(health_router, "APP_COMMIT", "b" * 40)
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == health_router.APP_VERSION
    assert data["commit"] == "b" * 40
    assert data["liveness_endpoint"] == "/api/health/liveness"
    assert data["readiness_endpoint"] == "/api/health/readiness"
    # ``links`` is the first version's shape and stays for existing readers.
    assert data["links"] == {"liveness": "/api/health/liveness", "readiness": "/api/health/readiness"}


# ---------------------------------------------------------------------------
# Readiness endpoint
# ---------------------------------------------------------------------------


def test_readiness_check_success(readiness_client):
    """Test readiness check when auth and database are reachable."""
    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["auth"] == "ok"
    assert data["database"] == "ok"


def test_readiness_is_degraded_when_the_database_fails(readiness_client):
    async def failing_db():
        db = AsyncMock()
        db.execute.side_effect = RuntimeError("password=hunter2")
        yield db

    app.dependency_overrides[_get_db_if_enabled] = failing_db

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "auth": "ok", "database": "unreachable"}
    assert "hunter2" not in response.text


def test_readiness_is_degraded_when_the_identity_provider_is_unreachable(readiness_client, monkeypatch):
    async def unreachable() -> bool:
        raise OSError("connection refused")

    monkeypatch.setattr(health_router, "_jwks_reachable", unreachable)

    response = readiness_client.get("/api/health/readiness")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "auth": "unreachable", "database": "ok"}


def test_readiness_sets_the_statement_timeout_on_postgresql_only(readiness_client):
    statements: dict[str, list[str]] = {}

    def database(dialect: str):
        async def override():
            db = AsyncMock()
            db.bind.dialect.name = dialect
            statements[dialect] = []
            db.execute.side_effect = lambda statement: statements[dialect].append(str(statement))
            yield db

        return override

    for dialect in ("sqlite", "postgresql"):
        app.dependency_overrides[_get_db_if_enabled] = database(dialect)
        assert readiness_client.get("/api/health/readiness").status_code == 200

    assert statements["sqlite"] == ["SELECT 1"]
    assert statements["postgresql"] == ["SET LOCAL statement_timeout = '2s'", "SELECT 1"]


@pytest.mark.asyncio
async def test_jwks_reachable_coalesces_concurrent_cache_misses(monkeypatch):
    calls = 0

    async def reachable() -> bool:
        nonlocal calls
        calls += 1
        await health_router.asyncio.sleep(0)
        return True

    monkeypatch.setattr(health_router, "_jwks_readiness_cache", None)
    monkeypatch.setattr(health_router, "_check_jwks_reachable", reachable)

    results = await health_router.asyncio.gather(*(health_router._jwks_reachable() for _ in range(5)))

    assert results == [True] * 5
    assert calls == 1
