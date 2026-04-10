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
    
    # Should return 200 or 503 depending on share directory state
    assert response.status_code in [200, 503]
    
    # Should be JSON response
    data = response.json()
    assert "status" in data
    assert "share" in data
    
    # Status should be either "ok" or "degraded"
    assert data["status"] in ["ok", "degraded"]


def test_root_endpoint(client):
    """Test the root endpoint."""
    response = client.get("/")
    
    assert response.status_code == 200
    assert "Worktime Backend API" in response.text
    assert "v1.0.0" in response.text
    assert response.headers["content-type"] == "text/plain; charset=utf-8"


def test_openapi_docs(client):
    """Test that OpenAPI docs are accessible."""
    response = client.get("/openapi.json")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["openapi"] == "3.1.0"
    assert data["info"]["title"] == "Worktime Backend API"
    assert data["info"]["version"] == "1.0.0"
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
