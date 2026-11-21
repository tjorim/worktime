"""Error bodies carry a stable ``code`` next to the English ``detail``."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import (
    ApiHTTPException,
    ErrorCode,
    api_error,
    default_error_code,
    handle_api_http_exception,
    handle_http_exception,
    handle_label_validation_error,
    handle_unhandled_exception,
    handle_validation_error,
)


class Counted(BaseModel):
    count: int = Field(ge=3)
    name: str


class Labelled(BaseModel):
    label_id: int
    note: str


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.add_exception_handler(ApiHTTPException, handle_api_http_exception)
    app.add_exception_handler(StarletteHTTPException, handle_http_exception)
    app.add_exception_handler(Exception, handle_unhandled_exception)

    @app.get("/coded")
    async def coded() -> None:
        raise api_error(409, ErrorCode.USERNAME_TAKEN, "username already exists")

    @app.get("/coded-headers")
    async def coded_headers() -> None:
        raise api_error(
            401, ErrorCode.INVALID_TOKEN, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"}
        )

    @app.get("/plain")
    async def plain() -> None:
        raise HTTPException(status_code=404, detail="nope")

    @app.get("/plain-headers")
    async def plain_headers() -> None:
        raise HTTPException(status_code=429, detail="slow down", headers={"Retry-After": "7"})

    @app.get("/no-content")
    async def no_content() -> None:
        raise HTTPException(status_code=304)

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret detail")

    return TestClient(app, raise_server_exceptions=False)


def test_coded_error_has_code_and_detail(client: TestClient) -> None:
    response = client.get("/coded")

    assert response.status_code == 409
    assert response.json() == {"code": "username_taken", "detail": "username already exists"}


def test_coded_error_keeps_headers(client: TestClient) -> None:
    response = client.get("/coded-headers")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["code"] == "invalid_token"


def test_plain_http_exception_keeps_its_detail_and_gets_a_code_from_the_status(client: TestClient) -> None:
    response = client.get("/plain")

    assert response.status_code == 404
    assert response.json() == {"detail": "nope", "code": "not_found"}


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (400, "bad_request"),
        (401, "unauthorized"),
        (403, "forbidden"),
        (404, "not_found"),
        (405, "method_not_allowed"),
        (409, "http_409"),
        (418, "http_418"),
        (503, "http_503"),
    ],
)
def test_default_error_code(status: int, code: str) -> None:
    assert default_error_code(status) == code


def test_plain_http_exception_passes_its_headers_on(client: TestClient) -> None:
    response = client.get("/plain-headers")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "7"
    assert response.json() == {"detail": "slow down", "code": "http_429"}


def test_an_unknown_route_and_a_wrong_method_get_a_code(client: TestClient) -> None:
    missing = client.get("/missing")
    wrong_method = client.post("/plain")

    assert (missing.status_code, missing.json()["code"]) == (404, "not_found")
    assert (wrong_method.status_code, wrong_method.json()["code"]) == (405, "method_not_allowed")
    assert wrong_method.headers["Allow"] == "GET"


def test_a_bodyless_status_stays_bodyless(client: TestClient) -> None:
    response = client.get("/no-content")

    assert response.status_code == 304
    assert response.content == b""


async def test_handle_http_exception_keeps_a_code_the_exception_carries() -> None:
    # Reached directly: ApiHTTPException normally goes to handle_api_http_exception, but a subclass that falls
    # through to the framework handler must keep its own code rather than the status default.
    exc = api_error(409, ErrorCode.USERNAME_TAKEN, "username already exists")
    response = await handle_http_exception(Request({"type": "http", "headers": []}), exc)

    assert response.status_code == 409
    assert json.loads(bytes(response.body)) == {"detail": "username already exists", "code": "username_taken"}


def test_error_codes_are_unique_snake_case() -> None:
    values = [code.value for code in ErrorCode]

    assert len(values) == len(set(values))
    assert all(value == value.lower() and " " not in value for value in values)


def test_unhandled_exception_is_a_json_500_with_a_request_id(client: TestClient) -> None:
    response = client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert response.headers["X-Request-ID"]
    assert "secret detail" not in response.text


def test_validation_error_is_the_detail_list_without_input_or_ctx_plus_a_code() -> None:
    app = FastAPI()
    app.add_exception_handler(RequestValidationError, handle_validation_error)

    @app.post("/validate")
    async def validate(payload: Counted) -> None: ...

    response = TestClient(app).post("/validate", json={"count": 1, "name": "secret"})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert [entry["loc"] for entry in body["detail"]] == [["body", "count"]]
    assert all(set(entry) == {"type", "loc", "msg"} for entry in body["detail"])
    assert "secret" not in response.text


def test_label_validation_handler_keeps_label_required_and_sanitises_the_rest() -> None:
    app = FastAPI()
    app.add_exception_handler(RequestValidationError, handle_label_validation_error)

    @app.post("/api/time-tracking/things")
    async def tracked(payload: Labelled) -> None: ...

    @app.post("/api/other")
    async def other(payload: Labelled) -> None: ...

    client = TestClient(app)
    label = client.post("/api/time-tracking/things", json={"note": "x"})
    other_response = client.post("/api/other", json={"label_id": 1, "note": ["secret"]})

    assert label.status_code == 422
    assert label.json() == {"code": "label_required", "detail": "A label is required"}
    assert other_response.status_code == 422
    assert other_response.json()["code"] == "validation_error"
    assert "secret" not in other_response.text
