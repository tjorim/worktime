"""Tests for SuperTokens-based authentication helpers.

The SuperTokens core is not available in the test environment, so these
tests exercise the ``get_authenticated_principal`` dependency through the
``_test_auth_principal`` override registered by the ``db_client`` fixture.
"""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_unauthenticated_request_returns_401(
    db_client: TestClient,
) -> None:
    """Requests without an Authorization header should be rejected."""
    response = db_client.get("/v1/db/users/1")
    assert response.status_code == 401


def test_authenticated_request_succeeds(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """A valid test token should grant access to protected endpoints."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "auth-user")

    response = db_client.get(
        f"/v1/db/users/{user_id}",
        headers=auth_headers(user_id),
    )
    assert response.status_code == 200
    assert response.json()["username"] == "auth-user"


def test_non_admin_cannot_create_user(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    """Only admins should be able to create new users."""
    response = db_client.post(
        "/v1/db/users/",
        json={
            "username": "non-admin-user",
            "display_name": "Non Admin",
            "settings": {},
            "password": "test-password-1",
        },
        headers=auth_headers(99),
    )
    assert response.status_code == 403


def test_admin_can_create_user(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    """Admins should be able to create new users."""
    admin_headers = auth_headers(1, is_admin=True)
    response = db_client.post(
        "/v1/db/users/",
        json={
            "username": "admin-created-user",
            "display_name": "Admin Created",
            "settings": {},
            "password": "test-password-1",
        },
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "admin-created-user"


def test_user_cannot_access_other_user(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """Users should not be able to access other users' data."""
    admin_headers = auth_headers(1, is_admin=True)
    user_a = create_user_factory(db_client, admin_headers, "user-a")
    user_b = create_user_factory(db_client, admin_headers, "user-b")

    response = db_client.get(
        f"/v1/db/users/{user_b}",
        headers=auth_headers(user_a),
    )
    assert response.status_code == 403
