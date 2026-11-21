"""Error bodies carry a stable ``code`` next to the English ``detail``."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import ApiHTTPException, ErrorCode, api_error, handle_api_http_exception


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.add_exception_handler(ApiHTTPException, handle_api_http_exception)

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

    return TestClient(app)


def test_coded_error_has_code_and_detail(client: TestClient) -> None:
    response = client.get("/coded")

    assert response.status_code == 409
    assert response.json() == {"code": "username_taken", "detail": "username already exists"}


def test_coded_error_keeps_headers(client: TestClient) -> None:
    response = client.get("/coded-headers")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["code"] == "invalid_token"


def test_plain_http_exception_has_no_code(client: TestClient) -> None:
    response = client.get("/plain")

    assert response.json() == {"detail": "nope"}


def test_error_codes_are_unique_snake_case() -> None:
    values = [code.value for code in ErrorCode]

    assert len(values) == len(set(values))
    assert all(value == value.lower() and " " not in value for value in values)
