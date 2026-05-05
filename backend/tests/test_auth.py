"""Tests for OIDC-based authentication helpers.

The OIDC provider is not available in the test environment, so these
tests exercise the ``get_authenticated_principal`` dependency through the
``_test_auth_principal`` override registered by the ``db_client`` fixture.

Unit tests for the realm_access.roles-based ``is_admin`` logic patch
``decode_token`` and ``get_or_create_local_user`` directly to avoid
needing a real OIDC provider or database.
"""

from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.routers.auth import get_authenticated_principal


def test_unauthenticated_request_returns_401(
    db_client: TestClient,
) -> None:
    """Requests without an Authorization header should be rejected."""
    response = db_client.get("/api/users/1")
    assert response.status_code == 401


def test_malformed_token_returns_401(
    db_client: TestClient,
) -> None:
    """Tokens with a non-integer user_id segment should be rejected with 401."""
    response = db_client.get(
        "/api/users/1",
        headers={"Authorization": "Bearer test.not-an-int.user"},
    )
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
        f"/api/users/{user_id}",
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
        "/api/users/",
        json={
            "username": "non-admin-user",
            "display_name": "Non Admin",
            "settings": {},
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
        "/api/users/",
        json={
            "username": "admin-created-user",
            "display_name": "Admin Created",
            "settings": {},
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
        f"/api/users/{user_b}",
        headers=auth_headers(user_a),
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Unit tests for realm_access.roles-based is_admin detection
# These patch decode_token and get_or_create_local_user to avoid needing a
# real OIDC provider or database connection.
# ---------------------------------------------------------------------------

_FAKE_USER = SimpleNamespace(id=1, username="alice")
_FAKE_CREDENTIALS = HTTPAuthorizationCredentials(scheme="Bearer", credentials="fake.token")


async def _call_principal(claims: dict) -> bool:
    """Helper: call get_authenticated_principal with patched dependencies."""
    with (
        patch("app.routers.auth.decode_token", new=AsyncMock(return_value=claims)),
        patch("app.routers.auth.get_or_create_local_user", new=AsyncMock(return_value=_FAKE_USER)),
    ):
        principal = await get_authenticated_principal(
            credentials=_FAKE_CREDENTIALS,
            session=AsyncMock(),
        )
    return principal.is_admin


async def test_is_admin_true_with_admin_role() -> None:
    """is_admin must be True when the JWT contains the 'admin' realm role."""
    claims = {"sub": "user-sub", "realm_access": {"roles": ["admin", "offline_access"]}}
    assert await _call_principal(claims) is True


async def test_is_admin_false_without_admin_role() -> None:
    """is_admin must be False when 'admin' is not in realm_access.roles."""
    claims = {"sub": "user-sub", "realm_access": {"roles": ["offline_access"]}}
    assert await _call_principal(claims) is False


async def test_is_admin_false_with_missing_realm_access() -> None:
    """is_admin must be False when the realm_access claim is absent entirely."""
    claims = {"sub": "user-sub"}
    assert await _call_principal(claims) is False


async def test_is_admin_false_with_null_realm_access() -> None:
    """is_admin must be False when the realm_access claim is null."""
    claims = {"sub": "user-sub", "realm_access": None}
    assert await _call_principal(claims) is False


async def test_is_admin_false_with_empty_roles() -> None:
    """is_admin must be False when realm_access.roles is an empty list."""
    claims = {"sub": "user-sub", "realm_access": {"roles": []}}
    assert await _call_principal(claims) is False


async def test_is_admin_false_with_roles_string() -> None:
    """is_admin must be False when realm_access.roles is not a list."""
    claims = {"sub": "user-sub", "realm_access": {"roles": "admin"}}
    assert await _call_principal(claims) is False
