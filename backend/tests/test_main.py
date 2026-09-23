"""Tests for FastAPI application endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


def test_health_check(client):
    """Test the health check endpoint."""
    response = client.get("/api/health")

    # Should return 200 or 503 depending on external service state
    assert response.status_code in [200, 503]

    data = response.json()
    assert "status" in data
    assert data["status"] in ["ok", "degraded"]


def test_root_endpoint(client):
    """Test the root endpoint."""
    response = client.get("/")

    assert response.status_code == 200
    assert "Worktime Backend API" in response.text
    assert f"v{app.version}" in response.text
    assert response.headers["content-type"] == "text/plain; charset=utf-8"


def test_openapi_docs(client):
    """Test that OpenAPI docs are accessible."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    data = response.json()

    assert data["openapi"] == "3.1.0"
    assert data["info"]["title"] == "Worktime Backend API"
    assert data["info"]["version"] == app.version
    assert "/api/health" in data["paths"]
    assert "/" in data["paths"]


def test_swagger_ui_docs(client):
    """Test that Swagger UI docs are accessible."""
    response = client.get("/docs")

    assert response.status_code == 200
    assert "swagger" in response.text.lower()


def test_redoc_docs(client):
    """Test that ReDoc docs are accessible."""
    response = client.get("/redoc")

    assert response.status_code == 200
    assert "redoc" in response.text.lower()


def test_404_handling(client):
    """Test that 404 errors are handled properly."""
    response = client.get("/nonexistent")

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


def test_mcp_capabilities_reports_disabled_with_empty_tools_when_unmounted(client):
    """MCP_BASE_URL is unset for the test app, so the MCP server isn't
    mounted — the capability manifest must say so and list no tools, rather
    than advertising tools that aren't actually reachable."""
    response = client.get("/api/mcp/capabilities")

    assert response.status_code == 200
    data = response.json()
    assert data["contract_version"] == 1
    assert data["enabled"] is False
    assert data["mount_path"] == "/mcp"
    assert data["version"] is None
    assert data["tools"] == []
    assert data["resources"] == []
    assert data["prompts"] == []


def test_mcp_capabilities_enabled_manifest_follows_contract_v1(client, monkeypatch):
    """Tools use the shared read/write vocabulary with the always-present
    requires_confirmation and access fields; Worktime's finer classification
    survives as effect_detail and the legacy required_tier key is kept."""
    from types import SimpleNamespace

    from app import main
    from app.mcp_server import MCP_TOOL_CAPABILITIES

    monkeypatch.setattr(main, "_mcp_app", object())
    monkeypatch.setattr(main, "_mcp", SimpleNamespace(version="test"))

    data = client.get("/api/mcp/capabilities").json()

    assert data["contract_version"] == 1
    assert data["enabled"] is True
    assert data["version"] == "test"
    tools = {tool["name"]: tool for tool in data["tools"]}
    assert set(tools) == set(MCP_TOOL_CAPABILITIES)
    assert [tool["name"] for tool in data["tools"]] == sorted(tools)
    for name, tool in tools.items():
        assert tool["effect"] in ("read", "write"), name
        assert tool["requires_confirmation"] is False, name
        assert tool["required_tier"] == "owner", name
        assert tool["access"] == {"tier": tool["required_tier"]}, name
        assert ("effect_detail" in tool) is (tool["effect"] == "write"), name
    assert tools["get_current_status"]["effect"] == "read"
    assert tools["create_label"]["effect"] == "write"
    assert tools["create_label"]["effect_detail"] == "personal_write"
