"""Tests for the request ID middleware."""

import logging
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app

_UUID4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


@pytest.fixture
def client():
    return TestClient(app)


class TestRequestIdHeader:
    """X-Request-ID header presence and value contract."""

    def test_header_present_on_success(self, client):
        response = client.get("/")
        assert "X-Request-ID" in response.headers

    def test_generated_id_is_uuid4(self, client):
        response = client.get("/")
        request_id = response.headers["X-Request-ID"]
        assert _UUID4_RE.match(request_id), f"Expected UUID4, got: {request_id}"

    def test_supplied_id_is_echoed(self, client):
        supplied = "my-gateway-req-id-001"
        response = client.get("/", headers={"X-Request-ID": supplied})
        assert response.headers["X-Request-ID"] == supplied

    def test_each_request_gets_unique_id(self, client):
        ids = {client.get("/").headers["X-Request-ID"] for _ in range(5)}
        assert len(ids) == 5, "Expected unique ID per request"

    def test_header_present_on_404(self, client):
        response = client.get("/nonexistent-path-xyz")
        assert response.status_code == 404
        assert "X-Request-ID" in response.headers

    def test_header_present_on_health(self, client):
        response = client.get("/api/health")
        assert "X-Request-ID" in response.headers

    def test_header_present_alongside_timing_header(self, client):
        response = client.get("/")
        assert "X-Request-ID" in response.headers
        assert "X-Total-Ms" in response.headers


class TestAccessLog:
    """Structured access log output."""

    def test_access_log_emitted_per_request(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health")
        access_lines = [r for r in caplog.records if r.name == "worktime.access"]
        assert len(access_lines) >= 1

    def test_access_log_contains_method_and_path(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health")
        lines = [r.getMessage() for r in caplog.records if r.name == "worktime.access"]
        assert any("GET" in line and "/api/health" in line for line in lines)

    def test_access_log_contains_status_code(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health")
        lines = [r.getMessage() for r in caplog.records if r.name == "worktime.access"]
        assert any("200" in line for line in lines)

    def test_access_log_contains_request_id(self, client, caplog):
        supplied = "trace-abc-123"
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health", headers={"X-Request-ID": supplied})
        lines = [r.getMessage() for r in caplog.records if r.name == "worktime.access"]
        assert any(supplied in line for line in lines)

    def test_access_log_contains_latency(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health")
        lines = [r.getMessage() for r in caplog.records if r.name == "worktime.access"]
        assert any("ms" in line for line in lines)

    def test_access_log_contains_auth_field(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health")
        lines = [r.getMessage() for r in caplog.records if r.name == "worktime.access"]
        assert any("auth=" in line for line in lines)

    def test_access_log_does_not_include_query_params(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health?sensitive=secret-token")
        lines = [r.getMessage() for r in caplog.records if r.name == "worktime.access"]
        assert lines
        assert not any("sensitive" in line or "secret-token" in line for line in lines)
