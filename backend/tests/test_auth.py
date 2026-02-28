"""Tests for authentication endpoints: POST /v1/auth/token and GET /v1/auth/me."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_login_valid_credentials_returns_token(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    create_user_factory(db_client, admin_headers, "auth-user")

    response = db_client.post(
        "/v1/auth/token",
        json={"username": "auth-user", "password": "test-password-1"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert isinstance(data["expires_in"], int)
    assert data["expires_in"] > 0


def test_login_token_is_usable_for_me(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "me-user")

    login_response = db_client.post(
        "/v1/auth/token",
        json={"username": "me-user", "password": "test-password-1"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = db_client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    data = me_response.json()
    assert data["id"] == user_id
    assert data["username"] == "me-user"


def test_login_wrong_password_returns_401(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    create_user_factory(db_client, admin_headers, "wrong-pw-user")

    response = db_client.post(
        "/v1/auth/token",
        json={"username": "wrong-pw-user", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_login_unknown_username_returns_401(
    db_client: TestClient,
) -> None:
    response = db_client.post(
        "/v1/auth/token",
        json={"username": "nobody", "password": "some-password"},
    )
    assert response.status_code == 401


def test_me_without_token_returns_401(
    db_client: TestClient,
) -> None:
    response = db_client.get("/v1/auth/me")
    assert response.status_code == 401
