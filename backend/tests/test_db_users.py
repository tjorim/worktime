"""Tests for database-backed user endpoints."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_user_crud_and_settings_roundtrip(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)

    create_response = db_client.post(
        "/v1/db/users/",
        json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}},
        headers=admin_headers,
    )
    assert create_response.status_code == 201
    user = create_response.json()
    user_id = user["id"]
    assert user["settings"] == {"theme": "dark"}

    get_response = db_client.get(f"/v1/db/users/{user_id}", headers=auth_headers(user_id))
    assert get_response.status_code == 200
    assert get_response.json()["settings"] == {"theme": "dark"}

    by_username_response = db_client.get(
        "/v1/db/users/by-username/api-user",
        headers=auth_headers(user_id),
    )
    assert by_username_response.status_code == 200
    assert by_username_response.json()["id"] == user_id

    list_response = db_client.get(
        "/v1/db/users/?offset=0&limit=10",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    update_response = db_client.put(
        f"/v1/db/users/{user_id}",
        json={"display_name": "Updated", "settings": {"theme": "light", "weekStartsOn": "monday"}},
        headers=auth_headers(user_id),
    )
    assert update_response.status_code == 200
    assert update_response.json()["display_name"] == "Updated"
    assert update_response.json()["settings"] == {"theme": "light", "weekStartsOn": "monday"}

    delete_response = db_client.delete(f"/v1/db/users/{user_id}", headers=auth_headers(user_id))
    assert delete_response.status_code == 204


def test_user_duplicate_and_not_found(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)

    first_create = db_client.post(
        "/v1/db/users/",
        json={"username": "duplicate", "display_name": "First", "settings": {}},
        headers=admin_headers,
    )
    assert first_create.status_code == 201

    duplicate_create = db_client.post(
        "/v1/db/users/",
        json={"username": "duplicate", "display_name": "Second", "settings": {}},
        headers=admin_headers,
    )
    assert duplicate_create.status_code == 409

    missing_user_get = db_client.get("/v1/db/users/99999", headers=auth_headers(99999, is_admin=True))
    assert missing_user_get.status_code == 404

    missing_user_update = db_client.put(
        "/v1/db/users/99999",
        json={"display_name": "Missing"},
        headers=auth_headers(99999, is_admin=True),
    )
    assert missing_user_update.status_code == 404

    missing_user_delete = db_client.delete("/v1/db/users/99999", headers=auth_headers(99999, is_admin=True))
    assert missing_user_delete.status_code == 404
