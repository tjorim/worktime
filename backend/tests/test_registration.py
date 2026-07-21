"""Tests for the admin-only user pre-registration endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_success_defaults_display_name(db_client: TestClient, auth_headers) -> None:
    """Happy path: display_name defaults to username when not provided."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "newuser"},
        headers=auth_headers(1, is_admin=True),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "newuser"
    assert body["display_name"] == "newuser"
    assert "id" in body
    assert "created_at" in body
    assert "settings" in body


def test_register_success_with_display_name(db_client: TestClient, auth_headers) -> None:
    """Registration with an explicit display_name stores it correctly."""
    response = db_client.post(
        "/api/users/register",
        json={
            "username": "nameduser",
            "display_name": "Named User",
        },
        headers=auth_headers(1, is_admin=True),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "nameduser"
    assert body["display_name"] == "Named User"


def test_register_requires_auth(db_client: TestClient) -> None:
    """Unauthenticated registration attempts are rejected."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "publicuser"},
    )
    assert response.status_code == 401


def test_register_requires_admin(db_client: TestClient, auth_headers) -> None:
    """Non-admin users cannot pre-register accounts (prevents username squatting)."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "squatter"},
        headers=auth_headers(2, is_admin=False),
    )
    assert response.status_code == 403


def test_register_duplicate_username_conflict(db_client: TestClient, auth_headers) -> None:
    """Second registration with the same username returns 409 Conflict."""
    admin_h = auth_headers(1, is_admin=True)
    first_response = db_client.post(
        "/api/users/register",
        json={"username": "duplicate"},
        headers=admin_h,
    )
    assert first_response.status_code == 201
    assert first_response.json()["username"] == "duplicate"

    response = db_client.post(
        "/api/users/register",
        json={"username": "duplicate"},
        headers=admin_h,
    )
    assert response.status_code == 409
    assert "username already exists" in response.json()["detail"]


def test_register_empty_username_rejected(db_client: TestClient, auth_headers) -> None:
    """Empty username is rejected with 422."""
    response = db_client.post(
        "/api/users/register",
        json={"username": ""},
        headers=auth_headers(1, is_admin=True),
    )
    assert response.status_code == 422


def test_register_username_too_long_rejected(db_client: TestClient, auth_headers) -> None:
    """Usernames longer than 150 characters are rejected with 422."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "x" * 151},
        headers=auth_headers(1, is_admin=True),
    )
    assert response.status_code == 422


def test_register_username_with_whitespace_rejected(db_client: TestClient, auth_headers) -> None:
    """Usernames containing whitespace or control characters are rejected with 422."""
    admin_h = auth_headers(1, is_admin=True)
    for bad_username in ("has space", " leading", "tab\tchar", "new\nline"):
        response = db_client.post(
            "/api/users/register",
            json={"username": bad_username},
            headers=admin_h,
        )
        assert response.status_code == 422, bad_username


def test_register_username_email_style_accepted(db_client: TestClient, auth_headers) -> None:
    """Email-local-part style usernames (dots, plus, dashes) remain valid."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "first.last+tag-1"},
        headers=auth_headers(1, is_admin=True),
    )
    assert response.status_code == 201
