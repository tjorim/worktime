"""Tests for the user registration endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_success_defaults_display_name(db_client: TestClient) -> None:
    """Happy path: display_name defaults to username when not provided."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "newuser"},
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
        "/api/users/register",
        json={
            "username": "nameduser",
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
        "/api/users/register",
        json={"username": "publicuser"},
    )
    assert response.status_code == 201


def test_register_duplicate_username_conflict(db_client: TestClient) -> None:
    """Second registration with the same username returns 409 Conflict."""
    first_response = db_client.post(
        "/api/users/register",
        json={"username": "duplicate"},
    )
    assert first_response.status_code == 201
    assert first_response.json()["username"] == "duplicate"

    response = db_client.post(
        "/api/users/register",
        json={"username": "duplicate"},
    )
    assert response.status_code == 409
    assert "username already exists" in response.json()["detail"]


def test_register_empty_username_rejected(db_client: TestClient) -> None:
    """Empty username is rejected with 422."""
    response = db_client.post(
        "/api/users/register",
        json={"username": ""},
    )
    assert response.status_code == 422


def test_register_username_too_long_rejected(db_client: TestClient) -> None:
    """Usernames longer than 150 characters are rejected with 422."""
    response = db_client.post(
        "/api/users/register",
        json={"username": "x" * 151},
    )
    assert response.status_code == 422
