"""Tests for the self-serve user registration endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_register_success_defaults_display_name(db_client: TestClient) -> None:
    """Happy path: display_name defaults to username when not provided."""
    response = db_client.post(
        "/v1/users/register",
        json={"username": "newuser", "password": "securepass123"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "newuser"
    assert body["display_name"] == "newuser"
    assert "id" in body
    assert "created_at" in body
    assert "settings" in body


def test_register_success_with_display_name(db_client: TestClient) -> None:
    """Registration with an explicit display_name stores it correctly."""
    response = db_client.post(
        "/v1/users/register",
        json={
            "username": "nameduser",
            "password": "securepass123",
            "display_name": "Named User",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "nameduser"
    assert body["display_name"] == "Named User"


def test_register_no_auth_required(db_client: TestClient) -> None:
    """Registration endpoint must not require authentication."""
    response = db_client.post(
        "/v1/users/register",
        json={"username": "publicuser", "password": "securepass123"},
    )
    assert response.status_code == 201


def test_register_duplicate_username_db_conflict(db_client: TestClient) -> None:
    """Second registration with the same username returns 409 Conflict."""
    db_client.post(
        "/v1/users/register",
        json={"username": "duplicate", "password": "securepass123"},
    )
    response = db_client.post(
        "/v1/users/register",
        json={"username": "duplicate", "password": "anotherpass456"},
    )
    assert response.status_code == 409
    assert "username already exists" in response.json()["detail"]


def test_register_duplicate_username_st_conflict(db_client: TestClient) -> None:
    """When SuperTokens reports an existing email the endpoint returns 409."""
    from supertokens_python.recipe.emailpassword.interfaces import (
        EmailAlreadyExistsError as STEmailAlreadyExistsError,
    )

    st_conflict = STEmailAlreadyExistsError()

    with patch(
        "app.routers.registration.st_sign_up",
        new=AsyncMock(return_value=st_conflict),
    ):
        response = db_client.post(
            "/v1/users/register",
            json={"username": "stconflict", "password": "securepass123"},
        )
    assert response.status_code == 409
    assert response.json()["detail"] == "username already exists"


def test_register_rollback_on_db_failure(db_client: TestClient) -> None:
    """When DB user creation fails the SuperTokens identity is deleted."""
    from app.services.db_service import ConflictError

    with patch(
        "app.routers.registration.create_user",
        side_effect=ConflictError("username already exists"),
    ) as _mock_create, patch(
        "app.routers.registration.st_delete_user",
        new_callable=AsyncMock,
    ) as mock_delete:
        response = db_client.post(
            "/v1/users/register",
            json={"username": "rollback-user", "password": "securepass123"},
        )

    assert response.status_code == 409
    mock_delete.assert_called_once()


def test_register_rollback_on_unexpected_db_error(db_client: TestClient) -> None:
    """On an unexpected DB error the ST identity is deleted and 500 is returned."""
    with patch(
        "app.routers.registration.create_user",
        side_effect=RuntimeError("unexpected database error"),
    ), patch(
        "app.routers.registration.st_delete_user",
        new_callable=AsyncMock,
    ) as mock_delete:
        response = db_client.post(
            "/v1/users/register",
            json={"username": "error-user", "password": "securepass123"},
        )

    assert response.status_code == 500
    mock_delete.assert_called_once()


def test_register_password_too_short(db_client: TestClient) -> None:
    """Passwords shorter than 8 characters are rejected with 422."""
    response = db_client.post(
        "/v1/users/register",
        json={"username": "shortpw", "password": "short"},
    )
    assert response.status_code == 422
