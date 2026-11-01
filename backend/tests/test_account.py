"""Tests for the authenticated account profile endpoint (GET /me)."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import oidc_config
from app.database.models import GanttTask, Label, User
from app.main import app
from app.routers.auth import get_bearer_principal


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
    assert response.json()["code"] == "user_not_found"


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

    headers = auth_headers(user_id)
    label = db_client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Project", "color": "#123456"},
        headers=headers,
    )
    assert label.status_code == 201, label.text
    task = db_client.post(
        f"/api/gantt-tasks?user_id={user_id}",
        json={
            "name": "Labelled task",
            "start_date": "2026-03-01",
            "end_date": "2026-03-15",
            "label_id": label.json()["id"],
        },
        headers=headers,
    )
    assert task.status_code == 201, task.text

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

    stale_get = db_client.get("/api/me", headers=auth_headers(admin_id, is_admin=True))
    assert stale_get.status_code == 404


@pytest.mark.parametrize("self_service", [True, False], ids=["self-service", "admin"])
@pytest.mark.asyncio
async def test_delete_account_after_real_principal_lookup(
    db_client: TestClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    self_service: bool,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    """Authentication and deletion share the transaction opened by principal lookup."""
    monkeypatch.setattr(oidc_config.settings, "DEV_AUTH_BYPASS_TOKEN", "delete-account-test")
    auth_override = app.dependency_overrides.pop(get_bearer_principal)
    headers = {"Authorization": "Bearer delete-account-test"}
    profile = db_client.get("/api/me", headers=headers)
    assert profile.status_code == 200, profile.text
    user_id = profile.json()["id"]
    if not self_service:
        target = db_client.post(
            "/api/users/",
            json={"username": "delete-target", "display_name": "Delete Target", "settings": {}},
            headers=headers,
        )
        assert target.status_code == 201, target.text
        user_id = target.json()["id"]

    app.dependency_overrides[get_bearer_principal] = auth_override
    target_headers = auth_headers(user_id)
    label = db_client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Project", "color": "#123456"},
        headers=target_headers,
    )
    assert label.status_code == 201, label.text
    task = db_client.post(
        f"/api/gantt-tasks?user_id={user_id}",
        json={
            "name": "Labelled task",
            "start_date": "2026-03-01",
            "end_date": "2026-03-15",
            "label_id": label.json()["id"],
        },
        headers=target_headers,
    )
    assert task.status_code == 201, task.text

    app.dependency_overrides.pop(get_bearer_principal)
    endpoint = "/api/me" if self_service else f"/api/users/{user_id}"
    response = db_client.delete(endpoint, headers=headers)
    assert response.status_code == 204, response.text
    assert await db_session.get(User, user_id) is None
    for model in (Label, GanttTask):
        rows = await db_session.execute(select(model).where(model.user_id == user_id))
        assert rows.scalars().all() == []
