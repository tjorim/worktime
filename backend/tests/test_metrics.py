"""Tests for the HMAC-protected metrics endpoint."""

import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


def _make_token(secret: str, ts: int | None = None) -> str:
    """Generate a valid HMAC metrics token for the given secret and timestamp."""
    if ts is None:
        ts = int(time.time())
    sig = hmac.new(secret.encode(), str(ts).encode(), hashlib.sha256).hexdigest()
    return f"{ts}:{sig}"


class TestMetricsEndpoint:
    """Tests for GET /api/metrics."""

    def test_returns_404_when_secret_not_configured(self, client, monkeypatch):
        """Endpoint returns 404 when METRICS_HMAC_SECRET is empty."""
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", "")
        response = client.get("/api/metrics")
        assert response.status_code == 404

    def test_returns_403_without_token(self, client, monkeypatch):
        """Endpoint returns 403 when no X-Metrics-Token header is supplied."""
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", "test-secret")
        response = client.get("/api/metrics")
        assert response.status_code == 403

    def test_returns_403_with_invalid_token(self, client, monkeypatch):
        """Endpoint returns 403 when the token signature is wrong."""
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", "test-secret")
        response = client.get("/api/metrics", headers={"X-Metrics-Token": "bad-token"})
        assert response.status_code == 403

    def test_returns_403_with_wrong_secret(self, client, monkeypatch):
        """Endpoint returns 403 when the token is signed with a different secret."""
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", "correct-secret")
        token = _make_token("wrong-secret")
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        assert response.status_code == 403

    def test_returns_403_with_expired_token(self, client, monkeypatch):
        """Endpoint returns 403 when the token timestamp is more than 60s old."""
        secret = "test-secret"
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
        old_ts = int(time.time()) - 120  # 2 minutes ago
        token = _make_token(secret, old_ts)
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        assert response.status_code == 403

    def test_returns_403_with_future_token(self, client, monkeypatch):
        """Endpoint returns 403 when the token timestamp is in the future."""
        secret = "test-secret"
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
        future_ts = int(time.time()) + 120  # 2 minutes in the future
        token = _make_token(secret, future_ts)
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        assert response.status_code == 403

    def test_returns_200_with_valid_token(self, client, monkeypatch):
        """Endpoint returns 200 with a snapshot when the token is valid."""
        secret = "test-secret"
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
        token = _make_token(secret)
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        assert response.status_code == 200

    def test_snapshot_contains_expected_keys(self, client, monkeypatch):
        """Metrics snapshot contains all required fields."""
        secret = "test-secret"
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
        token = _make_token(secret)
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        assert response.status_code == 200
        data = response.json()
        assert "uptime_seconds" in data
        assert "request_rate_per_second" in data
        assert "error_rate" in data
        assert "latency_p50_ms" in data
        assert "latency_p99_ms" in data
        assert "window_seconds" in data
        assert "request_count_in_window" in data

    def test_uptime_is_positive(self, client, monkeypatch):
        """uptime_seconds must be a positive number."""
        secret = "test-secret"
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
        token = _make_token(secret)
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        data = response.json()
        assert data["uptime_seconds"] > 0

    def test_error_rate_within_range(self, client, monkeypatch):
        """error_rate must be between 0 and 1 inclusive."""
        secret = "test-secret"
        monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
        token = _make_token(secret)
        response = client.get("/api/metrics", headers={"X-Metrics-Token": token})
        data = response.json()
        assert 0.0 <= data["error_rate"] <= 1.0
