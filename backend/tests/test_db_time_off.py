"""Tests for database-backed time-off entry endpoints (/db/time-off)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Auth tests
# ---------------------------------------------------------------------------


class TestTimeOffAuth:
    """Time-off endpoints require authentication."""

    def test_list_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/db/time-off/?user_id=1")
        assert resp.status_code == 401

    def test_create_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.post(
            "/db/time-off/?user_id=1",
            json={"date": "2026-06-01", "entry_type": "vacation"},
        )
        assert resp.status_code == 401

    def test_delete_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.delete("/db/time-off/2026-06-01?user_id=1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /db/time-off/  — create / upsert
# ---------------------------------------------------------------------------


class TestCreateTimeOff:
    """POST /db/time-off/ creates or updates a time-off entry."""

    def test_creates_entry(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-create")
        headers = auth_headers(user_id)

        resp = db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-07-14", "entry_type": "vacation", "flags": ["half_am"], "note": "summer"},
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["date"] == "2026-07-14"
        assert body["entry_type"] == "vacation"
        assert body["flags"] == ["half_am"]
        assert body["note"] == "summer"
        assert body["user_id"] == user_id
        assert "id" in body
        assert "created_at" in body
        assert "updated_at" in body

    def test_upserts_existing_entry(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-upsert")
        headers = auth_headers(user_id)

        first = db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-08-01", "entry_type": "vacation", "flags": []},
            headers=headers,
        )
        assert first.status_code == 201

        second = db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-08-01", "entry_type": "sick", "flags": ["ill"], "note": "updated"},
            headers=headers,
        )
        assert second.status_code == 201
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["entry_type"] == "sick"
        assert second.json()["note"] == "updated"

    def test_forbidden_for_other_user(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_a = create_user_factory(db_client, admin_h, "to-forbidden-a")
        user_b = create_user_factory(db_client, admin_h, "to-forbidden-b")
        headers_b = auth_headers(user_b)

        resp = db_client.post(
            f"/db/time-off/?user_id={user_a}",
            json={"date": "2026-09-01", "entry_type": "vacation"},
            headers=headers_b,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /db/time-off/  — list
# ---------------------------------------------------------------------------


class TestListTimeOff:
    """GET /db/time-off/ lists active time-off entries for the user."""

    def test_returns_empty_list_initially(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-list-empty")
        headers = auth_headers(user_id)

        resp = db_client.get(f"/db/time-off/?user_id={user_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["items"] == []

    def test_returns_created_entries(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-list-full")
        headers = auth_headers(user_id)

        for day in [1, 2, 3]:
            db_client.post(
                f"/db/time-off/?user_id={user_id}",
                json={"date": f"2026-06-0{day}", "entry_type": "vacation"},
                headers=headers,
            )

        resp = db_client.get(f"/db/time-off/?user_id={user_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 3

    def test_filters_by_date_range(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-list-range")
        headers = auth_headers(user_id)

        for day in [5, 10, 15, 20]:
            db_client.post(
                f"/db/time-off/?user_id={user_id}",
                json={"date": f"2026-06-{day:02}", "entry_type": "vacation"},
                headers=headers,
            )

        resp = db_client.get(
            f"/db/time-off/?user_id={user_id}&start_date=2026-06-10&end_date=2026-06-15",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 2
        dates = [item["date"] for item in resp.json()["items"]]
        assert "2026-06-10" in dates
        assert "2026-06-15" in dates

    def test_does_not_return_other_users_entries(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_a = create_user_factory(db_client, admin_h, "to-isolation-a")
        user_b = create_user_factory(db_client, admin_h, "to-isolation-b")
        headers_a = auth_headers(user_a)
        headers_b = auth_headers(user_b)

        db_client.post(
            f"/db/time-off/?user_id={user_a}",
            json={"date": "2026-07-01", "entry_type": "vacation"},
            headers=headers_a,
        )

        resp = db_client.get(f"/db/time-off/?user_id={user_b}", headers=headers_b)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_list_forbidden_for_other_user(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_a = create_user_factory(db_client, admin_h, "to-list-forbidden-a")
        user_b = create_user_factory(db_client, admin_h, "to-list-forbidden-b")
        headers_b = auth_headers(user_b)

        resp = db_client.get(f"/db/time-off/?user_id={user_a}", headers=headers_b)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /db/time-off/{date}  — single entry
# ---------------------------------------------------------------------------


class TestGetTimeOff:
    """GET /db/time-off/{date} returns a specific time-off entry."""

    def test_returns_entry(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-get")
        headers = auth_headers(user_id)

        db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-08-15", "entry_type": "sick"},
            headers=headers,
        )

        resp = db_client.get(f"/db/time-off/2026-08-15?user_id={user_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["date"] == "2026-08-15"
        assert resp.json()["entry_type"] == "sick"

    def test_returns_404_when_not_found(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-get-404")
        headers = auth_headers(user_id)

        resp = db_client.get(f"/db/time-off/2026-01-01?user_id={user_id}", headers=headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /db/time-off/{date}  — partial update
# ---------------------------------------------------------------------------


class TestPatchTimeOff:
    """PATCH /db/time-off/{date} partially updates a time-off entry."""

    def test_updates_note(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-patch")
        headers = auth_headers(user_id)

        db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-09-10", "entry_type": "vacation", "note": "first note"},
            headers=headers,
        )

        resp = db_client.patch(
            f"/db/time-off/2026-09-10?user_id={user_id}",
            json={"note": "updated note"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["note"] == "updated note"
        assert resp.json()["entry_type"] == "vacation"


# ---------------------------------------------------------------------------
# DELETE /db/time-off/{date}  — soft delete
# ---------------------------------------------------------------------------


class TestDeleteTimeOff:
    """DELETE /db/time-off/{date} soft-deletes a time-off entry."""

    def test_soft_deletes_entry(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-delete")
        headers = auth_headers(user_id)

        db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-10-03", "entry_type": "vacation"},
            headers=headers,
        )

        resp = db_client.delete(f"/db/time-off/2026-10-03?user_id={user_id}", headers=headers)
        assert resp.status_code == 204

        # Entry no longer appears in list
        list_resp = db_client.get(f"/db/time-off/?user_id={user_id}", headers=headers)
        assert list_resp.json()["total"] == 0

    def test_returns_404_when_not_found(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-delete-404")
        headers = auth_headers(user_id)

        resp = db_client.delete(f"/db/time-off/2026-01-01?user_id={user_id}", headers=headers)
        assert resp.status_code == 404

    def test_deleted_entry_can_be_recreated(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-delete-recreate")
        headers = auth_headers(user_id)

        db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-11-11", "entry_type": "vacation"},
            headers=headers,
        )
        db_client.delete(f"/db/time-off/2026-11-11?user_id={user_id}", headers=headers)

        # Re-create the same date
        resp = db_client.post(
            f"/db/time-off/?user_id={user_id}",
            json={"date": "2026-11-11", "entry_type": "sick"},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["entry_type"] == "sick"

        list_resp = db_client.get(f"/db/time-off/?user_id={user_id}", headers=headers)
        assert list_resp.json()["total"] == 1
