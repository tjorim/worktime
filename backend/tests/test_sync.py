"""Tests for the bidirectional sync endpoints (/db/sync)."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_user(client: TestClient, admin_headers: dict, username: str) -> int:
    resp = client.post(
        "/db/users/",
        json={"username": username, "display_name": username, "settings": {}, "password": "test-password-1"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _ts(offset_seconds: float = 0.0) -> str:
    """Return an ISO timestamp offset from now."""
    return (datetime.now(UTC) + timedelta(seconds=offset_seconds)).isoformat()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSyncAuth:
    """Sync endpoints require authentication."""

    def test_push_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.post("/db/sync/push", json={"labels": [], "tasks": [], "templates": [], "work_locations": []})
        assert resp.status_code == 401

    def test_pull_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/db/sync/pull")
        assert resp.status_code == 401

    def test_status_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/db/sync/status")
        assert resp.status_code == 401


class TestSyncStatus:
    """GET /db/sync/status"""

    def test_status_returns_nulls_for_empty_user(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "status-user")
        headers = auth_headers(user_id)

        resp = db_client.get("/db/sync/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["labels_updated_at"] is None
        assert body["tasks_updated_at"] is None
        assert body["templates_updated_at"] is None
        assert body["work_locations_updated_at"] is None
        assert "server_timestamp" in body
        assert "X-Sync-Ms" in resp.headers

    def test_status_reflects_existing_records(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "status-user-2")
        headers = auth_headers(user_id)

        # Create a label via the CRUD endpoint.
        db_client.post(
            f"/db/time-tracking/labels?user_id={user_id}",
            json={"name": "Work", "color": "#AABBCC"},
            headers=headers,
        )

        resp = db_client.get("/db/sync/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["labels_updated_at"] is not None
        assert body["tasks_updated_at"] is None


class TestSyncPull:
    """GET /db/sync/pull"""

    def test_pull_returns_all_records_without_since(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "pull-user-1")
        headers = auth_headers(user_id)

        db_client.post(
            f"/db/time-tracking/labels?user_id={user_id}",
            json={"name": "Deep Work", "color": "#112233"},
            headers=headers,
        )

        resp = db_client.get("/db/sync/pull", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["labels"]) == 1
        assert body["labels"][0]["name"] == "Deep Work"
        assert "updated_at" in body["labels"][0]
        assert "deleted_at" in body["labels"][0]
        assert "server_timestamp" in body
        assert "X-Sync-Ms" in resp.headers

    def test_pull_respects_since_parameter(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "pull-user-2")
        headers = auth_headers(user_id)

        # Create a label, then record a timestamp, then create another.
        db_client.post(
            f"/db/time-tracking/labels?user_id={user_id}",
            json={"name": "Before", "color": "#001122"},
            headers=headers,
        )
        since = datetime.now(UTC).isoformat()
        time.sleep(0.01)
        db_client.post(
            f"/db/time-tracking/labels?user_id={user_id}",
            json={"name": "After", "color": "#223344"},
            headers=headers,
        )

        resp = db_client.get("/db/sync/pull", params={"since": since}, headers=headers)
        assert resp.status_code == 200
        names = [item["name"] for item in resp.json()["labels"]]
        assert "After" in names
        assert "Before" not in names

    def test_pull_includes_soft_deleted_records(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "pull-user-3")
        headers = auth_headers(user_id)

        # Push a label, then soft-delete it via the sync endpoint.
        label_id = str(uuid4())
        db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "ToDelete",
                        "color": "#AABBCC",
                    }
                ],
            },
            headers=headers,
        )

        since = datetime.now(UTC).isoformat()

        db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "delete",
                        "client_updated_at": _ts(1),
                    }
                ],
            },
            headers=headers,
        )

        resp = db_client.get("/db/sync/pull", params={"since": since}, headers=headers)
        assert resp.status_code == 200
        labels = resp.json()["labels"]
        deleted = [lbl for lbl in labels if lbl["id"] == label_id]
        assert len(deleted) == 1
        assert deleted[0]["deleted_at"] is not None


class TestSyncPush:
    """POST /db/sync/push"""

    def test_push_mixed_creates_updates_deletes(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "push-user-1")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        template_id = str(uuid4())

        payload = {
            "labels": [
                {
                    "id": label_id,
                    "action": "create",
                    "client_updated_at": _ts(-5),
                    "name": "Focus",
                    "color": "#AABBCC",
                }
            ],
            "templates": [
                {
                    "id": template_id,
                    "action": "create",
                    "client_updated_at": _ts(-5),
                    "text": "Morning block",
                    "start_time": "09:00:00",
                    "stop_time": "11:00:00",
                }
            ],
        }
        resp = db_client.post("/db/sync/push", json=payload, headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["results"]["labels"][0]["status"] == "ok"
        assert body["results"]["templates"][0]["status"] == "ok"

        # Update the label.
        resp2 = db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(5),
                        "name": "Deep Focus",
                        "color": "#AABBCC",
                    }
                ],
            },
            headers=headers,
        )
        assert resp2.status_code == 200
        assert resp2.json()["results"]["labels"][0]["status"] == "ok"

        # Verify via pull.
        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        names = [lbl["name"] for lbl in pull_resp.json()["labels"]]
        assert "Deep Focus" in names

        # Delete the template via sync.
        resp3 = db_client.post(
            "/db/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "delete",
                        "client_updated_at": _ts(10),
                    }
                ],
            },
            headers=headers,
        )
        assert resp3.status_code == 200
        assert resp3.json()["results"]["templates"][0]["status"] == "ok"

    def test_last_write_wins_newer_client_wins(self, db_client: TestClient, auth_headers) -> None:
        """A newer client timestamp should overwrite the server value."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "lww-user-1")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        # Initial create.
        db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Original",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )

        # Client with a *newer* timestamp pushes an update — should win.
        resp = db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(30),
                        "name": "NewerName",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["results"]["labels"][0]["status"] == "ok"

        pull = db_client.get("/db/sync/pull", headers=headers)
        assert pull.json()["labels"][0]["name"] == "NewerName"

    def test_last_write_wins_older_client_rejected(self, db_client: TestClient, auth_headers) -> None:
        """An older (or equal) client timestamp should result in a conflict."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "lww-user-2")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        # Initial create (server records current time as updated_at).
        db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(0),
                        "name": "ServerName",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )

        # Stale client tries to overwrite with an older timestamp — conflict.
        resp = db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(-30),
                        "name": "StaleName",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        result = resp.json()["results"]["labels"][0]
        assert result["status"] == "conflict"
        assert result["conflict_reason"] is not None

        # Server name should be unchanged.
        pull = db_client.get("/db/sync/pull", headers=headers)
        assert pull.json()["labels"][0]["name"] == "ServerName"

    def test_idempotent_create_reprocessed_as_update(self, db_client: TestClient, auth_headers) -> None:
        """Sending action='create' for an existing ID is treated as an update."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "idempotent-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())

        def _push_create(name: str, ts_offset: float) -> dict:
            return {
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(ts_offset),
                        "name": name,
                        "color": "#AABBCC",
                    }
                ]
            }

        # First create.
        r1 = db_client.post("/db/sync/push", json=_push_create("First", -10), headers=headers)
        assert r1.json()["results"]["labels"][0]["status"] == "ok"

        # Re-send 'create' with a newer timestamp — treated as update.
        r2 = db_client.post("/db/sync/push", json=_push_create("Second", 10), headers=headers)
        assert r2.json()["results"]["labels"][0]["status"] == "ok"

        pull = db_client.get("/db/sync/pull", headers=headers)
        assert pull.json()["labels"][0]["name"] == "Second"

    def test_push_task_rejects_foreign_label_on_update(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        owner_id = _create_user(db_client, admin_h, "sync-owner-user")
        other_id = _create_user(db_client, admin_h, "sync-other-user")
        owner_headers = auth_headers(owner_id)
        other_headers = auth_headers(other_id)

        other_label_resp = db_client.post(
            f"/db/time-tracking/labels?user_id={other_id}",
            json={"name": "Other Label", "color": "#ABCDEF"},
            headers=other_headers,
        )
        assert other_label_resp.status_code == 201
        other_label_id = other_label_resp.json()["id"]

        task_id = str(uuid4())
        create_resp = db_client.post(
            "/db/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Owner task",
                        "start_time": _ts(-5),
                    }
                ]
            },
            headers=owner_headers,
        )
        assert create_resp.status_code == 200

        update_resp = db_client.post(
            "/db/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "update",
                        "client_updated_at": _ts(5),
                        "label_id": other_label_id,
                    }
                ]
            },
            headers=owner_headers,
        )
        assert update_resp.status_code == 400
        assert "label not found" in update_resp.json()["detail"]

    def test_push_task_allows_explicit_nullable_clears(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-clear-user")
        headers = auth_headers(user_id)

        label_resp = db_client.post(
            f"/db/time-tracking/labels?user_id={user_id}",
            json={"name": "Own Label", "color": "#123ABC"},
            headers=headers,
        )
        assert label_resp.status_code == 201
        label_id = label_resp.json()["id"]

        task_id = str(uuid4())
        create_resp = db_client.post(
            "/db/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "label_id": label_id,
                        "text": "Task with nullable fields",
                        "start_time": _ts(-5),
                        "stop_time": _ts(-4),
                    }
                ]
            },
            headers=headers,
        )
        assert create_resp.status_code == 200

        update_resp = db_client.post(
            "/db/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "update",
                        "client_updated_at": _ts(5),
                        "label_id": None,
                        "stop_time": None,
                    }
                ]
            },
            headers=headers,
        )
        assert update_resp.status_code == 200

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        task = next(item for item in pull_resp.json()["tasks"] if item["id"] == task_id)
        assert task["label_id"] is None
        assert task["stop_time"] is None

    def test_work_location_sync(self, db_client: TestClient, auth_headers) -> None:
        """Work locations are synced using date as the natural key."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "wl-sync-user")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/db/sync/push",
            json={
                "work_locations": [
                    {
                        "date": "2026-03-01",
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "country_code": "BE",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["results"]["work_locations"][0]["status"] == "ok"

        pull = db_client.get("/db/sync/pull", headers=headers)
        wls = pull.json()["work_locations"]
        assert len(wls) == 1
        assert wls[0]["country_code"] == "BE"

    def test_work_location_partial_update_preserves_fields(self, db_client: TestClient, auth_headers) -> None:
        """A partial update should not clear un-provided fields."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "wl-partial-update-user")
        headers = auth_headers(user_id)

        db_client.post(
            "/db/sync/push",
            json={
                "work_locations": [
                    {
                        "date": "2026-03-02",
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "country_code": "BE",
                        "label": "Office",
                    }
                ]
            },
            headers=headers,
        )

        update_resp = db_client.post(
            "/db/sync/push",
            json={
                "work_locations": [
                    {
                        "date": "2026-03-02",
                        "action": "update",
                        "client_updated_at": _ts(10),
                        "country_code": "DE",
                    }
                ]
            },
            headers=headers,
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["results"]["work_locations"][0]["status"] == "ok"

        pull = db_client.get("/db/sync/pull", headers=headers)
        wls = pull.json()["work_locations"]
        assert len(wls) == 1
        assert wls[0]["country_code"] == "DE"
        assert wls[0]["label"] == "Office"

    def test_push_template_rejects_foreign_label_on_update(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        owner_id = _create_user(db_client, admin_h, "template-owner-user")
        other_id = _create_user(db_client, admin_h, "template-other-user")
        owner_headers = auth_headers(owner_id)
        other_headers = auth_headers(other_id)

        other_label_resp = db_client.post(
            f"/db/time-tracking/labels?user_id={other_id}",
            json={"name": "Other Label", "color": "#FEDCBA"},
            headers=other_headers,
        )
        assert other_label_resp.status_code == 201
        other_label_id = other_label_resp.json()["id"]

        template_id = str(uuid4())
        create_resp = db_client.post(
            "/db/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Owner template",
                        "start_time": "09:00:00",
                        "stop_time": "17:00:00",
                    }
                ]
            },
            headers=owner_headers,
        )
        assert create_resp.status_code == 200

        update_resp = db_client.post(
            "/db/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "update",
                        "client_updated_at": _ts(5),
                        "label_id": other_label_id,
                    }
                ]
            },
            headers=owner_headers,
        )
        assert update_resp.status_code == 400
        assert "label not found" in update_resp.json()["detail"]

    def test_push_template_allows_explicit_nullable_clears(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "template-clear-user")
        headers = auth_headers(user_id)

        label_resp = db_client.post(
            f"/db/time-tracking/labels?user_id={user_id}",
            json={"name": "Own Label", "color": "#123456"},
            headers=headers,
        )
        assert label_resp.status_code == 201
        label_id = label_resp.json()["id"]

        template_id = str(uuid4())
        create_resp = db_client.post(
            "/db/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "label_id": label_id,
                        "text": "Template with nullable label",
                        "start_time": "08:00:00",
                        "stop_time": "12:00:00",
                    }
                ]
            },
            headers=headers,
        )
        assert create_resp.status_code == 200

        update_resp = db_client.post(
            "/db/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "update",
                        "client_updated_at": _ts(5),
                        "label_id": None,
                    }
                ]
            },
            headers=headers,
        )
        assert update_resp.status_code == 200

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        template = next(item for item in pull_resp.json()["templates"] if item["id"] == template_id)
        assert template["label_id"] is None

    def test_transaction_atomicity_rolls_back_on_failure(self, db_client: TestClient, auth_headers) -> None:
        """A validation error in one item aborts the whole batch."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "atomic-user")
        headers = auth_headers(user_id)

        valid_id = str(uuid4())

        # The second item lacks required fields for 'create' → ValidationError.
        payload = {
            "labels": [
                {
                    "id": valid_id,
                    "action": "create",
                    "client_updated_at": _ts(-5),
                    "name": "ShouldNotExist",
                    "color": "#AABBCC",
                },
                {
                    "id": str(uuid4()),
                    "action": "create",
                    "client_updated_at": _ts(-5),
                    # name and color intentionally omitted → ValidationError
                },
            ]
        }
        resp = db_client.post("/db/sync/push", json=payload, headers=headers)
        assert resp.status_code == 400

        # Nothing should have been committed.
        pull = db_client.get("/db/sync/pull", headers=headers)
        ids = [lbl["id"] for lbl in pull.json()["labels"]]
        assert valid_id not in ids

    def test_delete_non_existent_is_idempotent(self, db_client: TestClient, auth_headers) -> None:
        """Deleting an unknown record succeeds silently."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "del-idempotent-user")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/db/sync/push",
            json={
                "labels": [
                    {
                        "id": str(uuid4()),
                        "action": "delete",
                        "client_updated_at": _ts(-5),
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["results"]["labels"][0]["status"] == "ok"

    def test_push_response_includes_x_sync_ms_header(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "header-user")
        headers = auth_headers(user_id)

        resp = db_client.post("/db/sync/push", json={}, headers=headers)
        assert resp.status_code == 200
        assert "X-Sync-Ms" in resp.headers


class TestSyncTimeOffEntries:
    """Sync push/pull for time-off entries."""

    def test_push_create_time_off_entry(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-create")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-1"

        resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(),
                        "entry_kind": "date",
                        "date": "2026-07-01",
                        "entry_type": "vacation",
                        "entry_flag": "full_day",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        results = resp.json()["results"]["time_off_entries"]
        assert len(results) == 1
        assert results[0]["status"] == "ok"
        assert results[0]["id"] == entry_id

    def test_push_create_time_off_entry_applies_schema_defaults(
        self, db_client: TestClient, auth_headers
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-create-defaults")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-defaults"

        resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(),
                        "entry_kind": "date",
                        "date": "2026-07-02",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["results"]["time_off_entries"][0]["status"] == "ok"

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        created_entries = [
            item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id
        ]
        assert len(created_entries) == 1
        assert created_entries[0]["entry_type"] == "vacation"
        assert created_entries[0]["entry_flag"] == "full_day"

    def test_push_update_time_off_entry_allows_patch_without_kind(
        self, db_client: TestClient, auth_headers
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-update-patch")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-patch"

        create_resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "entry_kind": "date",
                        "date": "2026-07-03",
                        "entry_type": "vacation",
                        "entry_flag": "half_am",
                    }
                ]
            },
            headers=headers,
        )
        assert create_resp.status_code == 200

        update_resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "update",
                        "client_updated_at": _ts(),
                        "note": "patched note",
                    }
                ]
            },
            headers=headers,
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["results"]["time_off_entries"][0]["status"] == "ok"

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        updated_entries = [
            item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id
        ]
        assert len(updated_entries) == 1
        assert updated_entries[0]["entry_kind"] == "date"
        assert updated_entries[0]["date"] == "2026-07-03"
        assert updated_entries[0]["entry_type"] == "vacation"
        assert updated_entries[0]["entry_flag"] == "half_am"
        assert updated_entries[0]["note"] == "patched note"

    def test_push_update_time_off_entry_missing_record_requires_full_shape(
        self, db_client: TestClient, auth_headers
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-update-missing")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": "sync-timeoff-missing",
                        "action": "update",
                        "client_updated_at": _ts(),
                        "note": "patch only",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        result = resp.json()["results"]["time_off_entries"][0]
        assert result["status"] == "conflict"
        assert result["conflict_reason"] == "record does not exist for patch update"

    def test_push_update_time_off_entry_rejects_explicit_null_non_nullable_fields(
        self, db_client: TestClient, auth_headers
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-update-null-fields")
        headers = auth_headers(user_id)

        for field_name in ("entry_kind", "entry_type", "entry_flag"):
            resp = db_client.post(
                "/db/sync/push",
                json={
                    "time_off_entries": [
                        {
                            "id": f"sync-timeoff-null-{field_name}",
                            "action": "update",
                            "client_updated_at": _ts(),
                            field_name: None,
                        }
                    ]
                },
                headers=headers,
            )
            assert resp.status_code == 422

    def test_push_delete_time_off_entry(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-delete")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-delete"

        db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "entry_kind": "date",
                        "date": "2026-08-01",
                        "entry_type": "ill",
                    }
                ]
            },
            headers=headers,
        )

        resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "delete",
                        "client_updated_at": _ts(),
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["results"]["time_off_entries"][0]["status"] == "ok"

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        deleted_entries = [
            item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id
        ]
        assert len(deleted_entries) == 1
        assert deleted_entries[0]["deleted_at"] is not None

        status_resp = db_client.get("/db/sync/status", headers=headers)
        assert status_resp.status_code == 200
        assert status_resp.json()["time_off_entries_updated_at"] is not None

    def test_push_delete_time_off_entry_is_idempotent_and_visible_in_pull(
        self, db_client: TestClient, auth_headers
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-delete-repeat")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-delete-repeat"

        db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "entry_kind": "date",
                        "date": "2026-08-02",
                        "entry_type": "ill",
                    }
                ]
            },
            headers=headers,
        )
        db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "delete",
                        "client_updated_at": _ts(),
                    }
                ]
            },
            headers=headers,
        )

        second_delete = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "delete",
                        "client_updated_at": _ts(1),
                    }
                ]
            },
            headers=headers,
        )
        assert second_delete.status_code == 200
        assert second_delete.json()["results"]["time_off_entries"][0]["status"] == "ok"

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        deleted_entries = [
            item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id
        ]
        assert len(deleted_entries) == 1
        assert deleted_entries[0]["deleted_at"] is not None

        status_resp = db_client.get("/db/sync/status", headers=headers)
        assert status_resp.status_code == 200
        assert status_resp.json()["time_off_entries_updated_at"] is not None

    def test_pull_includes_time_off_entries(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-pull")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-pull"

        db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(),
                        "entry_kind": "range",
                        "start_date": "2026-09-01",
                        "end_date": "2026-09-03",
                        "entry_type": "vacation",
                    }
                ]
            },
            headers=headers,
        )

        pull_resp = db_client.get("/db/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        assert len(pull_resp.json()["time_off_entries"]) == 1
        assert pull_resp.json()["time_off_entries"][0]["entry_id"] == entry_id
        assert pull_resp.json()["time_off_entries"][0]["entry_kind"] == "range"
        assert pull_resp.json()["time_off_entries"][0]["start_date"] == "2026-09-01"
        assert pull_resp.json()["time_off_entries"][0]["end_date"] == "2026-09-03"

    def test_status_includes_time_off_and_preferences_fields(
        self, db_client: TestClient, auth_headers
    ) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-status-new-fields")
        headers = auth_headers(user_id)

        resp = db_client.get("/db/sync/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "time_off_entries_updated_at" in body
        assert body["time_off_entries_updated_at"] is None
        assert "preferences_updated_at" in body
        assert body["preferences_updated_at"] is None

    def test_time_off_conflict_detection(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-conflict")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-conflict"

        # Push with a newer timestamp first
        db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "create",
                        "client_updated_at": _ts(),
                        "entry_kind": "weekly",
                        "weekday": 1,
                        "entry_type": "vacation",
                    }
                ]
            },
            headers=headers,
        )

        # Push with an older timestamp → conflict
        resp = db_client.post(
            "/db/sync/push",
            json={
                "time_off_entries": [
                    {
                        "id": entry_id,
                        "action": "update",
                        "client_updated_at": _ts(-100),
                        "entry_kind": "date",
                        "date": "2026-10-01",
                        "entry_type": "ill",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        result = resp.json()["results"]["time_off_entries"][0]
        assert result["status"] == "conflict"
        assert result["conflict_reason"] == "server version is newer"
