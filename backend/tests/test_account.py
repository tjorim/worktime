"""Tests for the authenticated account profile endpoint (GET /me)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_unauthenticated_me_returns_401(db_client: TestClient) -> None:
    """Requests without an Authorization header should be rejected with 401."""
    response = db_client.get("/api/me")
    assert response.status_code == 401


def test_authenticated_me_returns_profile(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """Authenticated requests should return the current user's profile."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "me-user")

    response = db_client.get("/api/me", headers=auth_headers(user_id))

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
    """The is_admin field reflects the session token claim, which is derived from ADMIN_USERNAMES."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "me-regular")

    response = db_client.get("/api/me", headers=auth_headers(user_id, is_admin=True))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["is_admin"] is True
    assert "capabilities" in data


def test_me_stale_principal_returns_404(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    """A token for a user that does not exist in the DB should yield 404."""
    response = db_client.get("/api/me", headers=auth_headers(9999))
    assert response.status_code == 404


def test_unauthenticated_delete_me_returns_401(db_client: TestClient) -> None:
    """Requests without an Authorization header should be rejected with 401."""
    response = db_client.delete("/api/me")
    assert response.status_code == 401


def test_authenticated_delete_me_removes_user(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """A signed-in user can delete their own account and its data."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "delete-me-user")

    response = db_client.delete("/api/me", headers=auth_headers(user_id))

    assert response.status_code == 204

    stale_get = db_client.get("/api/me", headers=auth_headers(user_id))
    assert stale_get.status_code == 404

    admin_get = db_client.get(f"/api/users/{user_id}", headers=admin_headers)
    assert admin_get.status_code == 404


def test_admin_can_delete_own_account_via_me(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """Unlike DELETE /api/users/{id}, self-service deletion allows admins to delete themselves."""
    admin_headers = auth_headers(1, is_admin=True)
    admin_id = create_user_factory(db_client, admin_headers, "self-delete-admin")

    response = db_client.delete("/api/me", headers=auth_headers(admin_id, is_admin=True))

    assert response.status_code == 204
