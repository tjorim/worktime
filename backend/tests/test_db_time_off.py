"""Tests for database-backed time-off entry endpoints (/db/time-off)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def _create_entry(
    client: TestClient,
    headers: dict[str, str],
    payload: dict | None = None,
) -> dict:
    response = client.post(
        "/api/time-off/",
        json=payload or {"date": "2026-06-01", "entry_type": "vacation"},
        headers=headers,
    )
    assert response.status_code in {200, 201}, response.text
    return response.json()


class TestTimeOffAuth:
    def test_list_requires_auth(self, db_client: TestClient) -> None:
        assert db_client.get("/api/time-off/").status_code == 401

    def test_create_requires_auth(self, db_client: TestClient) -> None:
        assert db_client.post(
            "/api/time-off/",
            json={"date": "2026-06-01", "entry_type": "vacation"},
        ).status_code == 401

    def test_delete_requires_auth(self, db_client: TestClient) -> None:
        assert db_client.delete("/api/time-off/entry-1").status_code == 401

    def test_get_single_requires_auth(self, db_client: TestClient) -> None:
        assert db_client.get("/api/time-off/entry-1").status_code == 401

    def test_patch_single_requires_auth(self, db_client: TestClient) -> None:
        assert db_client.patch("/api/time-off/entry-1", json={"note": "unauthorized"}).status_code == 401

    def test_single_entry_routes_are_not_found_for_other_user(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_a = create_user_factory(db_client, admin_h, "to-auth-a")
        user_b = create_user_factory(db_client, admin_h, "to-auth-b")
        headers_a = auth_headers(user_a)
        headers_b = auth_headers(user_b)

        entry = _create_entry(db_client, headers_a)

        assert db_client.get(f"/api/time-off/{entry['entry_id']}", headers=headers_b).status_code == 404
        assert db_client.patch(
            f"/api/time-off/{entry['entry_id']}",
            json={"note": "forbidden"},
            headers=headers_b,
        ).status_code == 404
        assert db_client.delete(f"/api/time-off/{entry['entry_id']}", headers=headers_b).status_code == 404


class TestCreateTimeOff:

    def test_creates_date_entry(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-create")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/time-off/",
            json={"date": "2026-07-14", "entry_type": "vacation", "entry_flag": "half_am", "note": "summer"},
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["entry_id"]
        assert body["entry_kind"] == "date"
        assert body["date"] == "2026-07-14"
        assert body["start_date"] is None
        assert body["end_date"] is None
        assert body["weekday"] is None
        assert body["entry_type"] == "vacation"
        assert body["entry_flag"] == "half_am"
        assert body["note"] == "summer"

    def test_upserts_existing_entry_by_entry_id(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-upsert")
        headers = auth_headers(user_id)
        entry_id = "timeoff-upsert-1"

        first = db_client.post(
            "/api/time-off/",
            json={"entry_id": entry_id, "date": "2026-08-01", "entry_type": "vacation"},
            headers=headers,
        )
        assert first.status_code == 201

        second = db_client.post(
            "/api/time-off/",
            json={
                "entry_id": entry_id,
                "entry_kind": "range",
                "start_date": "2026-08-01",
                "end_date": "2026-08-03",
                "entry_type": "ill",
                "entry_flag": "half_pm",
                "note": "updated",
            },
            headers=headers,
        )
        assert second.status_code == 200
        body = second.json()
        assert body["id"] == first.json()["id"]
        assert body["entry_id"] == entry_id
        assert body["entry_kind"] == "range"
        assert body["date"] is None
        assert body["start_date"] == "2026-08-01"
        assert body["end_date"] == "2026-08-03"
        assert body["entry_type"] == "ill"
        assert body["entry_flag"] == "half_pm"
        assert body["note"] == "updated"


class TestTimeOffValidation:
    def test_rejects_unknown_entry_type(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-validate-type")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/time-off/",
            json={"date": "2026-07-14", "entry_type": "sick"},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_rejects_unknown_flag(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-validate-flag")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/time-off/",
            json={"date": "2026-07-14", "entry_type": "vacation", "entry_flag": "unknown_flag"},
            headers=headers,
        )
        assert resp.status_code == 422


class TestListTimeOff:
    def test_returns_empty_list_initially(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-list-empty")
        headers = auth_headers(user_id)

        resp = db_client.get("/api/time-off/", headers=headers)
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

        _create_entry(db_client, headers, {"date": "2026-06-01", "entry_type": "vacation"})
        _create_entry(
            db_client,
            headers,
            {"entry_kind": "range", "start_date": "2026-06-10", "end_date": "2026-06-12", "entry_type": "vacation"},
        )
        _create_entry(
            db_client,
            headers,
            {"entry_kind": "weekly", "weekday": 1, "entry_type": "in", "note": "Mondays"},
        )

        resp = db_client.get("/api/time-off/", headers=headers)
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

        _create_entry(db_client, headers, {"date": "2026-06-05", "entry_type": "vacation"})
        _create_entry(db_client, headers, {"date": "2026-06-10", "entry_type": "vacation"})
        _create_entry(
            db_client,
            headers,
            {"entry_kind": "range", "start_date": "2026-06-12", "end_date": "2026-06-15", "entry_type": "vacation"},
        )
        _create_entry(db_client, headers, {"date": "2026-06-20", "entry_type": "vacation"})

        resp = db_client.get(
            "/api/time-off/?start_date=2026-06-10&end_date=2026-06-15",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 2
        assert {item["entry_kind"] for item in resp.json()["items"]} == {"date", "range"}

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

        _create_entry(db_client, headers_a, {"date": "2026-07-01", "entry_type": "vacation"})

        resp = db_client.get("/api/time-off/", headers=headers_b)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestGetPatchDeleteTimeOff:
    def test_get_patch_delete_by_entry_id(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-single-entry")
        headers = auth_headers(user_id)

        created = _create_entry(
            db_client,
            headers,
            {"entry_kind": "weekly", "weekday": 5, "entry_type": "in", "note": "Fridays"},
        )
        entry_id = created["entry_id"]

        get_resp = db_client.get(f"/api/time-off/{entry_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["entry_kind"] == "weekly"
        assert get_resp.json()["weekday"] == 5

        patch_resp = db_client.patch(
            f"/api/time-off/{entry_id}",
            json={"entry_kind": "date", "date": "2026-09-10", "note": "updated note"},
            headers=headers,
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["entry_kind"] == "date"
        assert patch_resp.json()["date"] == "2026-09-10"
        assert patch_resp.json()["note"] == "updated note"

        delete_resp = db_client.delete(f"/api/time-off/{entry_id}", headers=headers)
        assert delete_resp.status_code == 204

        list_resp = db_client.get("/api/time-off/", headers=headers)
        assert list_resp.json()["total"] == 0

    def test_returns_404_when_entry_is_missing(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-404")
        headers = auth_headers(user_id)

        assert db_client.get("/api/time-off/not-found", headers=headers).status_code == 404
        assert db_client.patch(
            "/api/time-off/not-found",
            json={"note": "updated"},
            headers=headers,
        ).status_code == 404
        assert db_client.delete("/api/time-off/not-found", headers=headers).status_code == 404

    def test_deleted_entry_can_be_recreated_with_same_entry_id(
        self,
        db_client: TestClient,
        auth_headers: Callable[..., dict[str, str]],
        create_user_factory: Callable[..., int],
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = create_user_factory(db_client, admin_h, "to-delete-recreate")
        headers = auth_headers(user_id)
        entry_id = "timeoff-recreate-1"

        _create_entry(
            db_client,
            headers,
            {"entry_id": entry_id, "date": "2026-11-11", "entry_type": "vacation"},
        )
        assert db_client.delete(f"/api/time-off/{entry_id}", headers=headers).status_code == 204

        recreate = db_client.post(
            "/api/time-off/",
            json={"entry_id": entry_id, "date": "2026-11-11", "entry_type": "ill"},
            headers=headers,
        )
        assert recreate.status_code == 200
        assert recreate.json()["entry_id"] == entry_id
        assert recreate.json()["entry_type"] == "ill"
