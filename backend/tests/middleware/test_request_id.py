"""Tests for the request ID middleware."""

import json
import logging
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app

_UUID4_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


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

    @pytest.mark.parametrize("supplied", ["my-gateway-req-id-001", "a.b_c:d-1", "x" * 128])
    def test_supplied_token_is_echoed(self, client, supplied):
        response = client.get("/", headers={"X-Request-ID": supplied})
        assert response.headers["X-Request-ID"] == supplied

    @pytest.mark.parametrize("supplied", ["x" * 129, "has space", "a/b", "line\tbreak", "a;b", "é"])
    def test_unsafe_supplied_id_is_replaced(self, client, supplied):
        # A caller must not be able to put arbitrary text into the log lines.
        try:
            response = client.get("/", headers={"X-Request-ID": supplied})
        except UnicodeEncodeError:  # header values the client itself cannot encode never reach the server
            return
        assert _UUID4_RE.match(response.headers["X-Request-ID"])

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


def _access_records(caplog):
    return [r for r in caplog.records if r.name == "worktime.access"]


def _access_lines(caplog):
    return [json.loads(r.getMessage()) for r in _access_records(caplog)]


class TestAccessLog:
    """Structured access log output: one JSON object per request, with the field names the other apps use."""

    def test_access_line_has_the_shared_fields(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            response = client.get("/api/health", headers={"X-Request-ID": "trace-abc-123"})
        (line,) = _access_lines(caplog)
        assert set(line) == {
            "event",
            "request_id",
            "user_id",
            "auth_type",
            "method",
            "route",
            "status_code",
            "latency_ms",
        }
        assert line["event"] == "http_request"
        assert line["request_id"] == "trace-abc-123" == response.headers["X-Request-ID"]
        assert line["method"] == "GET"
        # The template of the route as the included router declares it (without the ``/api`` prefix), like the slow-request log.
        assert line["route"] == "/health"
        assert line["status_code"] == 200
        assert isinstance(line["latency_ms"], int | float) and line["latency_ms"] >= 0
        assert line["user_id"] is None and line["auth_type"] is None

    def test_levels_follow_the_status(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health")
            client.get("/nonexistent-path-xyz")
        levels = [(json.loads(r.getMessage())["status_code"], r.levelno) for r in _access_records(caplog)]
        assert levels == [(200, logging.INFO), (404, logging.WARNING)]

    def test_route_is_the_template_not_the_raw_path(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/ical/secret-feed-token.ics")
        text = " ".join(r.getMessage() for r in _access_records(caplog))
        assert "secret-feed-token" not in text
        assert _access_lines(caplog)[0]["route"] == "/ical/{token}.ics"

    def test_access_line_does_not_include_query_params(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health?sensitive=secret-token")
        lines = [r.getMessage() for r in _access_records(caplog)]
        assert lines
        assert not any("sensitive" in line or "secret-token" in line for line in lines)

    def test_a_forged_id_cannot_inject_a_log_line(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            client.get("/api/health", headers={"X-Request-ID": "x y"})
        (line,) = _access_lines(caplog)
        assert _UUID4_RE.match(line["request_id"])

    def test_user_and_auth_type_are_logged_for_an_authenticated_request(self, db_client, auth_headers, caplog):
        with caplog.at_level(logging.INFO, logger="worktime.access"):
            db_client.get("/api/users/9999", headers=auth_headers(7, is_admin=True))
        line = _access_lines(caplog)[-1]
        assert line["status_code"] == 404
        assert line["auth_type"] == "oidc"


def test_log_format_is_the_shared_layout():
    from app.core.logging import ACCESS_LOGGER, LOG_FORMAT

    assert LOG_FORMAT == "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    assert ACCESS_LOGGER == "worktime.access"
    record = logging.LogRecord("worktime.access", logging.INFO, __file__, 1, '{"event":"http_request"}', None, None)
    rendered = logging.Formatter(LOG_FORMAT).format(record)
    assert re.fullmatch(r"\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3} - worktime\.access - INFO - \{.*\}", rendered)


def test_current_request_id_is_set_below_the_middleware_and_reset_after():
    from fastapi import FastAPI

    from app.middleware.request_id import RequestIdMiddleware, current_request_id

    seen: list[str | None] = []
    inner = FastAPI()

    @inner.get("/seen")
    async def seen_route() -> dict[str, str | None]:
        seen.append(current_request_id.get())
        return {}

    inner.add_middleware(RequestIdMiddleware)
    response = TestClient(inner).get("/seen", headers={"X-Request-ID": "abc-1"})

    assert seen == ["abc-1"] == [response.headers["X-Request-ID"]]
    assert current_request_id.get() is None
