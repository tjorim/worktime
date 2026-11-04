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
        "/api/users/",
        json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}},
        headers=admin_headers,
    )
    assert create_response.status_code == 201
    user = create_response.json()
    user_id = user["id"]
    assert user["settings"] == {"theme": "dark"}

    get_response = db_client.get(f"/api/users/{user_id}", headers=auth_headers(user_id))
    assert get_response.status_code == 200
    assert get_response.json()["settings"] == {"theme": "dark"}

    by_username_response = db_client.get(
        "/api/users/by-username/api-user",
        headers=auth_headers(user_id),
    )
    assert by_username_response.status_code == 200
    assert by_username_response.json()["id"] == user_id

    list_response = db_client.get(
        "/api/users/?offset=0&limit=10",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    update_response = db_client.put(
        f"/api/users/{user_id}",
        json={"display_name": "Updated", "settings": {"theme": "light", "weekStartsOn": "monday"}},
        headers=auth_headers(user_id),
    )
    assert update_response.status_code == 200
    assert update_response.json()["display_name"] == "Updated"
    assert update_response.json()["settings"] == {"theme": "light", "weekStartsOn": "monday"}

    delete_response = db_client.delete(f"/api/users/{user_id}", headers=auth_headers(user_id))
    assert delete_response.status_code == 204

    deleted_get_response = db_client.get(f"/api/users/{user_id}", headers=auth_headers(user_id))
    assert deleted_get_response.status_code == 404


def test_user_duplicate_and_not_found(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)

    first_create = db_client.post(
        "/api/users/",
        json={"username": "duplicate", "display_name": "First", "settings": {}},
        headers=admin_headers,
    )
    assert first_create.status_code == 201

    duplicate_create = db_client.post(
        "/api/users/",
        json={"username": "duplicate", "display_name": "Second", "settings": {}},
        headers=admin_headers,
    )
    assert duplicate_create.status_code == 409
    assert duplicate_create.json()["code"] == "username_taken"

    missing_user_get = db_client.get("/api/users/99999", headers=admin_headers)
    assert missing_user_get.status_code == 404
    assert missing_user_get.json()["code"] == "user_not_found"

    missing_user_update = db_client.put(
        "/api/users/99999",
        json={"display_name": "Missing"},
        headers=admin_headers,
    )
    assert missing_user_update.status_code == 404

    missing_user_delete = db_client.delete("/api/users/99999", headers=admin_headers)
    assert missing_user_delete.status_code == 404
    assert missing_user_delete.json()["code"] == "user_not_found"


def test_admin_cannot_delete_own_account(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    response = db_client.delete("/api/users/1", headers=auth_headers(1, is_admin=True))

    assert response.status_code == 403
    assert response.json()["code"] == "admin_self_delete_forbidden"
    assert response.json()["detail"] == "Admins cannot delete their own account via this endpoint."


def test_username_validation(db_client, auth_headers):
    admin = auth_headers(1, is_admin=True)
    for name in ["", "   ", "a b/../c", "<script>x</script>", "a" * 65, "é"]:
        response = db_client.post("/api/users/", json={"username": name, "display_name": "Name"}, headers=admin)
        assert response.status_code == 400
        assert response.json()["code"] == "username_invalid"
    response = db_client.post("/api/users/", json={"username": "x" * 64, "display_name": "x" * 151}, headers=admin)
    assert response.status_code == 400
    assert response.json()["code"] == "display_name_invalid"
    response = db_client.post("/api/users/", json={"username": "x" * 64, "display_name": "x" * 150}, headers=admin)
    assert response.status_code == 201
    response = db_client.post(
        "/api/users/", json={"username": "  valid.name_-9  ", "display_name": "Name"}, headers=admin
    )
    assert response.status_code == 201
    user = response.json()
    assert user["username"] == "valid.name_-9"
    for name, code in [
        ("", "username_invalid"),
        ("   ", "username_invalid"),
        ("a b", "username_invalid"),
        ("a" * 65, "username_invalid"),
        ("ADMIN", "username_reserved"),
        ("root", "username_reserved"),
    ]:
        response = db_client.put(f"/api/users/{user['id']}", json={"username": name}, headers=auth_headers(user["id"]))
        assert response.status_code == 400
        assert response.json()["code"] == code
    response = db_client.put(f"/api/users/{user['id']}", json={"username": "admin"}, headers=admin)
    assert response.status_code == 200
    response = db_client.put(
        f"/api/users/{user['id']}", json={"display_name": "x" * 151}, headers=auth_headers(user["id"])
    )
    assert response.json()["code"] == "display_name_invalid"
    assert (
        db_client.put(
            f"/api/users/{user['id']}",
            json={"username": "admin", "display_name": "x" * 150},
            headers=auth_headers(user["id"]),
        ).status_code
        == 200
    )


async def test_legacy_username_and_rename_audit(db_client, auth_headers, db_session):
    from app.database.models import User, AuditEntry
    from sqlalchemy import select

    user = User(username=" legacy / name ", display_name="x" * 200, settings={})
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    headers = auth_headers(user.id)
    assert db_client.get(f"/api/users/{user.id}", headers=headers).status_code == 200
    assert (
        db_client.put(
            f"/api/users/{user.id}",
            json={"username": user.username, "display_name": user.display_name, "settings": {}},
            headers=headers,
        ).status_code
        == 200
    )
    response = db_client.put(
        f"/api/users/{user.id}", json={"username": " repaired "}, headers=auth_headers(user.id, is_admin=True)
    )
    assert response.status_code == 200
    entry = (await db_session.execute(select(AuditEntry).where(AuditEntry.action == "rename_user"))).scalar_one()
    assert entry.details == {"old_username": " legacy / name ", "new_username": "repaired"}
