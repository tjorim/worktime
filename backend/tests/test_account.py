"""Tests for the authenticated account profile endpoint (GET /me)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_unauthenticated_me_returns_401(db_client: TestClient) -> None:
    """Requests without an Authorization header should be rejected with 401."""
    response = db_client.get("/me")
    assert response.status_code == 401


def test_authenticated_me_returns_profile(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """Authenticated requests should return the current user's profile."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "me-user")

    response = db_client.get("/me", headers=auth_headers(user_id))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["username"] == "me-user"
    assert data["display_name"] == "Me-User"
    assert data["is_admin"] is False
    assert data["capabilities"]["backup_enabled"] is True


def test_admin_me_returns_admin_flag(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """The is_admin field reflects the DB record, not the session token role."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "me-regular")

    # The DB user has is_admin=False by default, regardless of the token role.
    response = db_client.get("/me", headers=auth_headers(user_id, is_admin=True))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["is_admin"] is False
    assert "capabilities" in data
