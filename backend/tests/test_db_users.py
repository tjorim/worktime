"""Tests for database-backed user endpoints."""

from __future__ import annotations

from collections.abc import Callable
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def test_user_crud_and_settings_roundtrip(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    supertokens_delete_calls: list[str],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)

    create_response = db_client.post(
        "/db/users/",
        json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert create_response.status_code == 201
    user = create_response.json()
    user_id = user["id"]
    assert user["settings"] == {"theme": "dark"}

    get_response = db_client.get(f"/db/users/{user_id}", headers=auth_headers(user_id))
    assert get_response.status_code == 200
    assert get_response.json()["settings"] == {"theme": "dark"}

    by_username_response = db_client.get(
        "/db/users/by-username/api-user",
        headers=auth_headers(user_id),
    )
    assert by_username_response.status_code == 200
    assert by_username_response.json()["id"] == user_id

    list_response = db_client.get(
        "/db/users/?offset=0&limit=10",
        headers=admin_headers,
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    update_response = db_client.put(
        f"/db/users/{user_id}",
        json={"display_name": "Updated", "settings": {"theme": "light", "weekStartsOn": "monday"}},
        headers=auth_headers(user_id),
    )
    assert update_response.status_code == 200
    assert update_response.json()["display_name"] == "Updated"
    assert update_response.json()["settings"] == {"theme": "light", "weekStartsOn": "monday"}

    delete_response = db_client.delete(f"/db/users/{user_id}", headers=auth_headers(user_id))
    assert delete_response.status_code == 204

    deleted_get_response = db_client.get(f"/db/users/{user_id}", headers=auth_headers(user_id))
    assert deleted_get_response.status_code == 404


def test_user_duplicate_and_not_found(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)

    first_create = db_client.post(
        "/db/users/",
        json={"username": "duplicate", "display_name": "First", "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert first_create.status_code == 201

    duplicate_create = db_client.post(
        "/db/users/",
        json={"username": "duplicate", "display_name": "Second", "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert duplicate_create.status_code == 409

    missing_user_get = db_client.get("/db/users/99999", headers=auth_headers(99999, is_admin=True))
    assert missing_user_get.status_code == 404

    missing_user_update = db_client.put(
        "/db/users/99999",
        json={"display_name": "Missing"},
        headers=auth_headers(99999, is_admin=True),
    )
    assert missing_user_update.status_code == 404

    missing_user_delete = db_client.delete("/db/users/99999", headers=auth_headers(99999, is_admin=True))
    assert missing_user_delete.status_code == 404


# ---------------------------------------------------------------------------
# Username rename tests (new in this PR)
# ---------------------------------------------------------------------------


def test_username_rename_happy_path(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    supertokens_update_email_calls: list[dict[str, str | None]],
) -> None:
    """Renaming a username updates both the local DB and the ST identity."""
    admin_headers = auth_headers(1, is_admin=True)

    create_resp = db_client.post(
        "/db/users/",
        json={"username": "old-username", "display_name": "Old", "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    update_resp = db_client.put(
        f"/db/users/{user_id}",
        json={"username": "new-username"},
        headers=auth_headers(user_id),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["username"] == "new-username"

    # ST should have received an email update call for the new username.
    assert len(supertokens_update_email_calls) == 1
    assert supertokens_update_email_calls[0]["email"] == "new-username@worktime.local"


def test_username_rename_no_change_skips_st_call(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    supertokens_update_email_calls: list[dict[str, str | None]],
) -> None:
    """When the username is unchanged (or not provided), ST is not called."""
    admin_headers = auth_headers(1, is_admin=True)

    create_resp = db_client.post(
        "/db/users/",
        json={"username": "same-username", "display_name": "Same", "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    # Update only display_name — username unchanged.
    update_resp = db_client.put(
        f"/db/users/{user_id}",
        json={"display_name": "Still Same"},
        headers=auth_headers(user_id),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["display_name"] == "Still Same"
    # No ST calls should be made when the username doesn't change.
    assert len(supertokens_update_email_calls) == 0


def test_username_rename_conflict_from_st_returns_409(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """When ST reports the target email already exists, the endpoint returns 409."""
    from supertokens_python.recipe.emailpassword.interfaces import (
        EmailAlreadyExistsError as STEmailAlreadyExistsError,
    )

    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "rename-st-conflict")

    st_conflict = STEmailAlreadyExistsError()
    with patch(
        "app.routers.db_users.st_update_email_or_password",
        new=AsyncMock(return_value=st_conflict),
    ):
        resp = db_client.put(
            f"/db/users/{user_id}",
            json={"username": "taken-by-st"},
            headers=auth_headers(user_id),
        )
    assert resp.status_code == 409
    assert "username already exists" in resp.json()["detail"]


def test_username_rename_unknown_st_user_returns_502(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """When ST reports the user identity is missing, the endpoint returns 502."""
    from supertokens_python.recipe.emailpassword.interfaces import (
        UnknownUserIdError as STUnknownUserIdError,
    )

    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "rename-st-unknown")

    st_unknown = STUnknownUserIdError()
    with patch(
        "app.routers.db_users.st_update_email_or_password",
        new=AsyncMock(return_value=st_unknown),
    ):
        resp = db_client.put(
            f"/db/users/{user_id}",
            json={"username": "should-fail"},
            headers=auth_headers(user_id),
        )
    assert resp.status_code == 502
    assert "missing" in resp.json()["detail"].lower()


def test_username_rename_st_unexpected_error_returns_500(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """When ST returns an unexpected result type, the endpoint returns 500."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "rename-st-unexpected")

    unexpected_result = MagicMock()
    # Return an object that is neither OkResult, EmailAlreadyExistsError,
    # nor UnknownUserIdError to trigger the catch-all 500 branch.
    with patch(
        "app.routers.db_users.st_update_email_or_password",
        new=AsyncMock(return_value=unexpected_result),
    ):
        resp = db_client.put(
            f"/db/users/{user_id}",
            json={"username": "should-500"},
            headers=auth_headers(user_id),
        )
    assert resp.status_code == 500


def test_username_rename_db_conflict_returns_409(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    supertokens_update_email_calls: list[dict[str, str | None]],
) -> None:
    """Renaming to a username already taken in the local DB returns 409."""
    admin_headers = auth_headers(1, is_admin=True)

    create_resp_a = db_client.post(
        "/db/users/",
        json={"username": "user-a", "display_name": "User A", "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert create_resp_a.status_code == 201

    create_resp_b = db_client.post(
        "/db/users/",
        json={"username": "user-b", "display_name": "User B", "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert create_resp_b.status_code == 201
    user_b_id = create_resp_b.json()["id"]

    # Attempt to rename user-b to user-a (already taken).
    update_resp = db_client.put(
        f"/db/users/{user_b_id}",
        json={"username": "user-a"},
        headers=auth_headers(user_b_id),
    )
    assert update_resp.status_code == 409


def test_username_rename_db_failure_attempts_st_rollback(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """When the DB update fails after an ST update, the endpoint tries to roll back ST."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "rename-db-fail")

    rollback_calls: list[dict] = []

    async def _fake_update_email(
        recipe_user_id: object,
        email: str | None = None,
        **kwargs: object,
    ) -> MagicMock:
        from supertokens_python.recipe.emailpassword.interfaces import (
            UpdateEmailOrPasswordOkResult as STUpdateEmailOrPasswordOkResult,
        )
        rollback_calls.append({"email": email})
        result = MagicMock()
        result.__class__ = STUpdateEmailOrPasswordOkResult
        return result

    with patch(
        "app.routers.db_users.st_update_email_or_password",
        side_effect=_fake_update_email,
    ), patch(
        "app.routers.db_users.update_user",
        side_effect=RuntimeError("unexpected DB error"),
    ):
        with pytest.raises(Exception):
            db_client.put(
                f"/db/users/{user_id}",
                json={"username": "new-that-db-rejects"},
                headers=auth_headers(user_id),
            )

    # ST should have been called twice: once for the rename, once for the rollback.
    assert len(rollback_calls) == 2


# ---------------------------------------------------------------------------
# Delete with SuperTokens check (new in this PR)
# ---------------------------------------------------------------------------


def test_delete_user_calls_st_delete_before_db(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    supertokens_delete_calls: list[str],
    create_user_factory: Callable[..., int],
) -> None:
    """Deleting a user should trigger a SuperTokens identity deletion."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "delete-st-called")

    delete_resp = db_client.delete(f"/db/users/{user_id}", headers=auth_headers(user_id))
    assert delete_resp.status_code == 204

    # The ST delete mock should have been called exactly once.
    assert len(supertokens_delete_calls) == 1


def test_delete_user_st_failure_returns_502(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """When ST deletion fails (returns falsy), the endpoint returns 502."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "delete-st-fails")

    with patch(
        "app.routers.db_users.st_delete_user",
        new=AsyncMock(return_value=False),
    ):
        resp = db_client.delete(f"/db/users/{user_id}", headers=auth_headers(user_id))
    assert resp.status_code == 502
    assert "could not be deleted" in resp.json()["detail"].lower()

    # The local user should still exist since ST deletion failed.
    get_resp = db_client.get(f"/db/users/{user_id}", headers=auth_headers(user_id))
    assert get_resp.status_code == 200