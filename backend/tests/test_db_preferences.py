"""Tests for database-backed user preferences endpoints (/db/preferences)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.conftest import utc_timestamp_offset as _ts

# ---------------------------------------------------------------------------
# Auth tests
# ---------------------------------------------------------------------------


class TestPreferencesAuth:
    """Preferences endpoints require authentication."""

    def test_get_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/db/preferences")
        assert resp.status_code == 401

    def test_put_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.put(
            "/db/preferences",
            json={"data": {"theme": "dark"}, "client_updated_at": _ts()},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /db/preferences
# ---------------------------------------------------------------------------


class TestGetPreferences:
    """GET /db/preferences returns the stored preferences or null."""

    def test_returns_null_when_no_preferences_stored(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "prefs-get-empty")
        headers = auth_headers(user_id)

        resp = db_client.get("/db/preferences", headers=headers)
        assert resp.status_code == 200
        assert resp.json() is None

    def test_returns_stored_preferences(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "prefs-get-stored")
        headers = auth_headers(user_id)

        ts = _ts()
        db_client.put(
            "/db/preferences",
            json={"data": {"theme": "dark", "language": "en"}, "client_updated_at": ts},
            headers=headers,
        )

        resp = db_client.get("/db/preferences", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body is not None
        assert body["data"] == {"theme": "dark", "language": "en"}
        assert body["user_id"] == user_id
        assert "updated_at" in body
        assert "created_at" in body
        assert "client_updated_at" in body


# ---------------------------------------------------------------------------
# PUT /db/preferences
# ---------------------------------------------------------------------------


class TestPutPreferences:
    """PUT /db/preferences creates or updates the authenticated user's preferences."""

    def test_creates_preferences_when_none_exist(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "prefs-create")
        headers = auth_headers(user_id)

        ts = _ts()
        resp = db_client.put(
            "/db/preferences",
            json={"data": {"roster": "5x8", "schedule": "morning"}, "client_updated_at": ts},
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == {"roster": "5x8", "schedule": "morning"}
        assert body["user_id"] == user_id

    def test_updates_preferences_when_client_is_newer(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "prefs-update-newer")
        headers = auth_headers(user_id)

        ts_old = _ts(-10)
        db_client.put(
            "/db/preferences",
            json={"data": {"theme": "light"}, "client_updated_at": ts_old},
            headers=headers,
        )

        ts_new = _ts()
        resp = db_client.put(
            "/db/preferences",
            json={"data": {"theme": "dark"}, "client_updated_at": ts_new},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {"theme": "dark"}

    def test_does_not_update_when_client_is_older(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "prefs-no-update-older")
        headers = auth_headers(user_id)

        ts_new = _ts()
        db_client.put(
            "/db/preferences",
            json={"data": {"theme": "dark"}, "client_updated_at": ts_new},
            headers=headers,
        )

        ts_old = _ts(-100)
        resp = db_client.put(
            "/db/preferences",
            json={"data": {"theme": "light"}, "client_updated_at": ts_old},
            headers=headers,
        )
        assert resp.status_code == 200
        # Should return the stored value unchanged (server wins)
        assert resp.json()["data"] == {"theme": "dark"}

    def test_users_cannot_read_others_preferences(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        """Each user only sees their own preferences via the authenticated endpoint."""
        admin_h = auth_headers(1, is_admin=True)
        user_a = create_user_factory(db_client, admin_h, "prefs-isolation-a")
        user_b = create_user_factory(db_client, admin_h, "prefs-isolation-b")

        headers_a = auth_headers(user_a)
        headers_b = auth_headers(user_b)

        ts = _ts()
        db_client.put(
            "/db/preferences",
            json={"data": {"secret": "a"}, "client_updated_at": ts},
            headers=headers_a,
        )

        # User B has no prefs → null
        resp_b = db_client.get("/db/preferences", headers=headers_b)
        assert resp_b.status_code == 200
        assert resp_b.json() is None

    def test_accepts_arbitrary_json_data(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "prefs-arbitrary-json")
        headers = auth_headers(user_id)

        complex_data: dict = {
            "roster": "4x9",
            "workSchedule": {"mon": 9, "tue": 9, "wed": 9, "thu": 9},
            "theme": "system",
            "nested": {"deep": {"value": [1, 2, 3]}},
        }
        resp = db_client.put(
            "/db/preferences",
            json={"data": complex_data, "client_updated_at": _ts()},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == complex_data
