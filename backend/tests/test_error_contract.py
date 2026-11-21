"""Error contract of the assembled app: one body shape, stable codes, no stack traces and no secrets.

``tests/core/test_api_errors.py`` covers the handler in isolation; these tests go through ``app.main:app`` so a
middleware or a router that changes the shape is caught. The wording of ``detail`` is not part of the contract, ``code``
is.
"""

import logging
from collections.abc import AsyncGenerator, Callable

import pytest
from fastapi.testclient import TestClient

from app.db.engine import get_session
from app.main import app

TRACE_MARKERS = ("Traceback", 'File "', "site-packages", "/app/", "sqlalchemy", "asyncpg", "aiosqlite")


def assert_error_body(body: dict) -> None:
    """Every app-raised failure is ``{"code": str, "detail": str}``."""
    assert set(body) == {"code", "detail"}
    assert isinstance(body["code"], str)
    assert body["code"] == body["code"].lower()
    assert body["detail"]


def test_app_raised_failures_use_one_shape_with_stable_codes(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]]
) -> None:
    admin = auth_headers(1, is_admin=True)
    expected = [
        (db_client.get("/api/users/9999", headers=admin), 404, "user_not_found"),
        (db_client.get("/api/time-tracking/tasks/99999", headers=admin), 404, "not_found"),
        (db_client.delete("/api/access-tokens/99999", headers=admin), 404, "access_token_not_found"),
        (db_client.post("/api/time-tracking/tasks", json={}, headers=admin), 422, "label_required"),
    ]
    for response, status, code in expected:
        assert response.status_code == status
        assert response.headers["content-type"] == "application/json"
        assert_error_body(response.json())
        assert response.json()["code"] == code


def test_an_invalid_bearer_token_is_a_coded_401() -> None:
    response = TestClient(app).get("/api/users/me", headers={"Authorization": "Bearer not-a-token"})

    assert response.status_code == 401
    assert_error_body(response.json())
    assert response.json()["code"] == "invalid_token"


def test_framework_failures_keep_their_detail_and_get_a_code_from_the_status() -> None:
    # Unknown paths, wrong methods and a missing credential are raised by Starlette/FastAPI, not by an app rule.
    client = TestClient(app)
    for response, status, code in (
        (client.get("/api/does-not-exist"), 404, "not_found"),
        (client.delete("/api/health"), 405, "method_not_allowed"),
        (client.get("/api/users/me"), 401, "unauthorized"),
    ):
        assert response.status_code == status
        assert response.headers["content-type"] == "application/json"
        assert set(response.json()) == {"code", "detail"}
        assert response.json()["code"] == code
        assert isinstance(response.json()["detail"], str)


def test_framework_failures_keep_their_headers() -> None:
    client = TestClient(app)

    assert "DELETE" not in client.delete("/api/health").headers["Allow"]
    assert client.get("/api/users/me").headers["WWW-Authenticate"] == "Bearer"


def test_validation_failures_list_the_field_errors(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]]
) -> None:
    response = db_client.post("/api/users/", json={"username": "x"}, headers=auth_headers(1, is_admin=True))

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert errors
    assert all({"type", "loc", "msg"} <= set(entry) for entry in errors)
    assert ["body", "display_name"] in [entry["loc"] for entry in errors]


def test_failures_never_carry_a_stack_trace_or_a_secret(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]]
) -> None:
    secret = "secret-token-value"
    admin = auth_headers(1, is_admin=True)
    responses = (
        db_client.get("/api/does-not-exist"),
        db_client.get("/api/users/me", headers={"Authorization": f"Bearer {secret}"}),
        db_client.get("/api/users/9999", headers=admin),
        db_client.post("/api/time-tracking/tasks", json={}, headers=admin),
        db_client.get("/api/ical/" + secret + ".ics"),
    )
    for response in responses:
        assert response.status_code >= 400
        assert secret not in response.text
        for marker in TRACE_MARKERS:
            assert marker not in response.text


def test_an_unhandled_exception_answers_the_json_500_with_a_request_id(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]], caplog: pytest.LogCaptureFixture
) -> None:
    # Starlette's ServerErrorMiddleware sends this response after RequestIdMiddleware has unwound, so the handler
    # registered for ``Exception`` has to put the id on it.
    async def failing() -> AsyncGenerator[None]:
        raise RuntimeError("secret-token postgresql://user:password@db/worktime")
        yield  # pragma: no cover

    app.dependency_overrides[get_session] = failing  # db_client restores its own override on teardown
    with caplog.at_level(logging.ERROR, logger="app.core.errors"):
        response = TestClient(app, raise_server_exceptions=False).get(
            "/api/users/9999", headers={**auth_headers(1, is_admin=True), "X-Request-ID": "trace-me-1"}
        )

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert response.headers["X-Request-ID"] == "trace-me-1"
    for secret in ("secret-token", "password", "postgresql"):
        assert secret not in response.text
    for marker in TRACE_MARKERS:
        assert marker not in response.text
    # The cause and the stack trace stay on the server, tied to the request id.
    record = next(record for record in caplog.records if record.name == "app.core.errors")
    assert "trace-me-1" in record.getMessage()
    assert isinstance(record.exc_info, tuple)
    assert "secret-token" in str(record.exc_info[1])


def test_an_unhandled_exception_gets_a_request_id_even_without_one_supplied(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]]
) -> None:
    async def failing() -> AsyncGenerator[None]:
        raise RuntimeError("boom")
        yield  # pragma: no cover

    app.dependency_overrides[get_session] = failing
    response = TestClient(app, raise_server_exceptions=False).get(
        "/api/users/9999", headers=auth_headers(1, is_admin=True)
    )

    assert response.status_code == 500
    assert response.headers["X-Request-ID"]
