"""Error contract of the assembled app: one body shape, stable codes, no stack traces and no secrets.

``tests/core/test_api_errors.py`` covers the handler in isolation; these tests go through ``app.main:app`` so a
middleware or a router that changes the shape is caught. The wording of ``detail`` is not part of the contract, ``code``
is.
"""

from collections.abc import AsyncGenerator, Callable

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


def test_framework_failures_are_json_with_a_detail() -> None:
    # Unknown paths, wrong methods and a missing credential are answered by Starlette/FastAPI before any app handler:
    # ``detail`` only, no ``code`` (recorded as a follow-up; adding one changes the body clients see).
    client = TestClient(app)
    for response, status in (
        (client.get("/api/does-not-exist"), 404),
        (client.delete("/api/health"), 405),
        (client.get("/api/users/me"), 401),
    ):
        assert response.status_code == status
        assert response.headers["content-type"] == "application/json"
        assert set(response.json()) == {"detail"}
        assert isinstance(response.json()["detail"], str)


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


def test_an_unhandled_exception_answers_500_without_leaking_its_cause(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]]
) -> None:
    # The unhandled-exception response is Starlette's plain text, not the JSON shape above, and carries no request id
    # (recorded as a follow-up).
    async def failing() -> AsyncGenerator[None]:
        raise RuntimeError("secret-token postgresql://user:password@db/worktime")
        yield  # pragma: no cover

    app.dependency_overrides[get_session] = failing  # db_client restores its own override on teardown
    response = TestClient(app, raise_server_exceptions=False).get(
        "/api/users/9999", headers=auth_headers(1, is_admin=True)
    )

    assert response.status_code == 500
    for secret in ("secret-token", "password", "postgresql"):
        assert secret not in response.text
    for marker in TRACE_MARKERS:
        assert marker not in response.text
