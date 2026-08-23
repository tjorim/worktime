"""Tests for the bidirectional sync endpoints (/db/sync)."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.database.models import TimeTrackingTask
from app.schemas import TaskSyncItem, UserCreate
from app.services.db_service import create_user
from app.services.sync_service import _push_task
from app.utils.sse_manager import SyncEventManager, _redact_credentials

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_user(client: TestClient, admin_headers: dict, username: str) -> int:
    resp = client.post(
        "/api/users/",
        json={"username": username, "display_name": username, "settings": {}},
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
        resp = db_client.post("/api/sync/push", json={"labels": [], "tasks": [], "templates": [], "work_locations": []})
        assert resp.status_code == 401

    def test_pull_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/api/sync/pull")
        assert resp.status_code == 401

    def test_status_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/api/sync/status")
        assert resp.status_code == 401

    def test_events_requires_auth(self, db_client: TestClient) -> None:
        resp = db_client.get("/api/sync/events")
        assert resp.status_code == 401


class TestSyncStatus:
    """GET /db/sync/status"""

    def test_status_returns_nulls_for_empty_user(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "status-user")
        headers = auth_headers(user_id)

        resp = db_client.get("/api/sync/status", headers=headers)
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
            f"/api/time-tracking/labels?user_id={user_id}",
            json={"name": "Work", "color": "#AABBCC"},
            headers=headers,
        )

        resp = db_client.get("/api/sync/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["labels_updated_at"] is not None
        assert body["tasks_updated_at"] is None


class TestSyncPull:
    """GET /db/sync/pull"""

    def test_timezone_naive_cursor_is_normalized(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "naive-cursor-user")
        naive_since = datetime.now(UTC).replace(tzinfo=None).isoformat()

        response = db_client.get(
            "/api/sync/pull",
            params={"since": naive_since},
            headers=auth_headers(user_id),
        )

        assert response.status_code == 200

    def test_expired_cursor_requires_full_resync(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "expired-cursor-user")

        response = db_client.get(
            "/api/sync/pull",
            params={"since": _ts(-91 * 24 * 60 * 60)},
            headers=auth_headers(user_id),
        )

        assert response.status_code == 410
        assert response.json()["detail"] == {
            "code": "sync_cursor_expired",
            "message": "Sync cursor is outside the supported offline window; perform a full resync.",
            "max_offline_days": 90,
        }

        retry = db_client.get("/api/sync/pull", headers=auth_headers(user_id))
        assert retry.status_code == 200

    def test_pull_returns_all_records_without_since(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "pull-user-1")
        headers = auth_headers(user_id)

        db_client.post(
            f"/api/time-tracking/labels?user_id={user_id}",
            json={"name": "Deep Work", "color": "#112233"},
            headers=headers,
        )

        resp = db_client.get("/api/sync/pull", headers=headers)
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
            f"/api/time-tracking/labels?user_id={user_id}",
            json={"name": "Before", "color": "#001122"},
            headers=headers,
        )
        since = datetime.now(UTC).isoformat()
        time.sleep(0.01)
        db_client.post(
            f"/api/time-tracking/labels?user_id={user_id}",
            json={"name": "After", "color": "#223344"},
            headers=headers,
        )

        resp = db_client.get("/api/sync/pull", params={"since": since}, headers=headers)
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
            "/api/sync/push",
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
            "/api/sync/push",
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

        resp = db_client.get("/api/sync/pull", params={"since": since}, headers=headers)
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
        resp = db_client.post("/api/sync/push", json=payload, headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["results"]["labels"][0]["status"] == "ok"
        assert body["results"]["templates"][0]["status"] == "ok"

        # Update the label.
        resp2 = db_client.post(
            "/api/sync/push",
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
        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        names = [lbl["name"] for lbl in pull_resp.json()["labels"]]
        assert "Deep Focus" in names

        # Delete the template via sync.
        resp3 = db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull = db_client.get("/api/sync/pull", headers=headers)
        assert pull.json()["labels"][0]["name"] == "NewerName"

    def test_last_write_wins_older_client_rejected(self, db_client: TestClient, auth_headers) -> None:
        """An older (or equal) client timestamp should result in a conflict."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "lww-user-2")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        # Initial create (server records current time as updated_at).
        db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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
        pull = db_client.get("/api/sync/pull", headers=headers)
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
        r1 = db_client.post("/api/sync/push", json=_push_create("First", -10), headers=headers)
        assert r1.json()["results"]["labels"][0]["status"] == "ok"

        # Re-send 'create' with a newer timestamp — treated as update.
        r2 = db_client.post("/api/sync/push", json=_push_create("Second", 10), headers=headers)
        assert r2.json()["results"]["labels"][0]["status"] == "ok"

        pull = db_client.get("/api/sync/pull", headers=headers)
        assert pull.json()["labels"][0]["name"] == "Second"

    def test_exact_replay_contract_for_every_sync_entity(self, db_client: TestClient, auth_headers) -> None:
        """Exact create/delete redelivery never duplicates or resurrects an entity."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "all-entity-replay-user")
        headers = auth_headers(user_id)
        entity_id = str(uuid4())

        cases = [
            (
                "labels",
                "id",
                entity_id,
                {"id": entity_id, "name": "Replay label", "color": "#AABBCC"},
            ),
            (
                "tasks",
                "id",
                str(uuid4()),
                {
                    "id": "",
                    "text": "Replay task",
                    "start_time": "2026-08-01T09:00:00+00:00",
                    "stop_time": "2026-08-01T10:00:00+00:00",
                },
            ),
            (
                "templates",
                "id",
                str(uuid4()),
                {"id": "", "text": "Replay template", "start_time": "09:00:00", "stop_time": "10:00:00"},
            ),
            (
                "gantt_tasks",
                "id",
                str(uuid4()),
                {"id": "", "name": "Replay plan", "start_date": "2026-08-01", "end_date": "2026-08-02"},
            ),
            (
                "time_off_entries",
                "entry_id",
                str(uuid4()),
                {"id": "", "entry_kind": "date", "date": "2026-08-03", "entry_type": "vacation"},
            ),
            (
                "work_locations",
                "date",
                "2026-08-04",
                {"date": "2026-08-04", "country_code": "BE", "label": "Office"},
            ),
        ]

        for collection, pull_key, identity, fields in cases:
            create_item = {**fields, "action": "create", "client_updated_at": _ts(-60)}
            if "id" in create_item and not create_item["id"]:
                create_item["id"] = identity
            create_payload = {collection: [create_item]}

            first = db_client.post("/api/sync/push", json=create_payload, headers=headers)
            replay = db_client.post("/api/sync/push", json=create_payload, headers=headers)
            assert first.status_code == 200, first.text
            assert first.json()["results"][collection][0]["status"] == "ok"
            assert replay.status_code == 200, replay.text
            assert replay.json()["results"][collection][0]["status"] == "conflict"

            pulled = db_client.get("/api/sync/pull", headers=headers).json()[collection]
            assert sum(row[pull_key] == identity for row in pulled) == 1

            delete_key = "date" if collection == "work_locations" else "id"
            delete_item = {delete_key: identity, "action": "delete", "client_updated_at": _ts(60)}
            delete_payload = {collection: [delete_item]}
            deleted = db_client.post("/api/sync/push", json=delete_payload, headers=headers)
            delete_replay = db_client.post("/api/sync/push", json=delete_payload, headers=headers)
            assert deleted.json()["results"][collection][0]["status"] == "ok"
            assert delete_replay.json()["results"][collection][0]["status"] == "ok"

            matching = [
                row
                for row in db_client.get("/api/sync/pull", headers=headers).json()[collection]
                if row[pull_key] == identity
            ]
            assert len(matching) == 1
            assert matching[0]["deleted_at"] is not None

    def test_push_task_rejects_foreign_label_on_update(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        owner_id = _create_user(db_client, admin_h, "sync-owner-user")
        other_id = _create_user(db_client, admin_h, "sync-other-user")
        owner_headers = auth_headers(owner_id)
        other_headers = auth_headers(other_id)

        other_label_resp = db_client.post(
            f"/api/time-tracking/labels?user_id={other_id}",
            json={"name": "Other Label", "color": "#ABCDEF"},
            headers=other_headers,
        )
        assert other_label_resp.status_code == 201
        other_label_id = other_label_resp.json()["id"]

        task_id = str(uuid4())
        create_resp = db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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
            f"/api/time-tracking/labels?user_id={user_id}",
            json={"name": "Own Label", "color": "#123ABC"},
            headers=headers,
        )
        assert label_resp.status_code == 201
        label_id = label_resp.json()["id"]

        task_id = str(uuid4())
        create_resp = db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
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
            "/api/sync/push",
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

        pull = db_client.get("/api/sync/pull", headers=headers)
        wls = pull.json()["work_locations"]
        assert len(wls) == 1
        assert wls[0]["country_code"] == "BE"

    def test_work_location_partial_update_preserves_fields(self, db_client: TestClient, auth_headers) -> None:
        """A partial update should not clear un-provided fields."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "wl-partial-update-user")
        headers = auth_headers(user_id)

        db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull = db_client.get("/api/sync/pull", headers=headers)
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
            f"/api/time-tracking/labels?user_id={other_id}",
            json={"name": "Other Label", "color": "#FEDCBA"},
            headers=other_headers,
        )
        assert other_label_resp.status_code == 201
        other_label_id = other_label_resp.json()["id"]

        template_id = str(uuid4())
        create_resp = db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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
            f"/api/time-tracking/labels?user_id={user_id}",
            json={"name": "Own Label", "color": "#123456"},
            headers=headers,
        )
        assert label_resp.status_code == 201
        label_id = label_resp.json()["id"]

        template_id = str(uuid4())
        create_resp = db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
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
        resp = db_client.post("/api/sync/push", json=payload, headers=headers)
        assert resp.status_code == 400

        # Nothing should have been committed.
        pull = db_client.get("/api/sync/pull", headers=headers)
        ids = [lbl["id"] for lbl in pull.json()["labels"]]
        assert valid_id not in ids

    def test_delete_non_existent_is_idempotent(self, db_client: TestClient, auth_headers) -> None:
        """Deleting an unknown record succeeds silently."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "del-idempotent-user")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/sync/push",
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

        resp = db_client.post("/api/sync/push", json={}, headers=headers)
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
            "/api/sync/push",
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

    def test_push_create_time_off_entry_applies_schema_defaults(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-create-defaults")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-defaults"

        resp = db_client.post(
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        created_entries = [item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id]
        assert len(created_entries) == 1
        assert created_entries[0]["entry_type"] == "vacation"
        assert created_entries[0]["entry_flag"] == "full_day"

    def test_push_update_time_off_entry_allows_patch_without_kind(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-update-patch")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-patch"

        create_resp = db_client.post(
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        updated_entries = [item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id]
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
            "/api/sync/push",
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
                "/api/sync/push",
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
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        deleted_entries = [item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id]
        assert len(deleted_entries) == 1
        assert deleted_entries[0]["deleted_at"] is not None

        status_resp = db_client.get("/api/sync/status", headers=headers)
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
            "/api/sync/push",
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
            "/api/sync/push",
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
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        deleted_entries = [item for item in pull_resp.json()["time_off_entries"] if item["entry_id"] == entry_id]
        assert len(deleted_entries) == 1
        assert deleted_entries[0]["deleted_at"] is not None

        status_resp = db_client.get("/api/sync/status", headers=headers)
        assert status_resp.status_code == 200
        assert status_resp.json()["time_off_entries_updated_at"] is not None

    def test_pull_includes_time_off_entries(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-to-pull")
        headers = auth_headers(user_id)
        entry_id = "sync-timeoff-pull"

        db_client.post(
            "/api/sync/push",
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

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        assert len(pull_resp.json()["time_off_entries"]) == 1
        assert pull_resp.json()["time_off_entries"][0]["entry_id"] == entry_id
        assert pull_resp.json()["time_off_entries"][0]["entry_kind"] == "range"
        assert pull_resp.json()["time_off_entries"][0]["start_date"] == "2026-09-01"
        assert pull_resp.json()["time_off_entries"][0]["end_date"] == "2026-09-03"

    def test_status_includes_time_off_and_preferences_fields(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "sync-status-new-fields")
        headers = auth_headers(user_id)

        resp = db_client.get("/api/sync/status", headers=headers)
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
            "/api/sync/push",
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
            "/api/sync/push",
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


class TestSyncMultiDeviceFlow:
    """
    End-to-end multi-device sync scenarios.

    These tests simulate the user journeys described in
    docs/local-first-sync-flow.md §2–§5 at the API level, using two
    separate auth contexts (device_a_headers / device_b_headers) that
    both represent the same user account.
    """

    # -------------------------------------------------------------------
    # §4 — Second-device restore (Branch B of the first-sync flow)
    # -------------------------------------------------------------------

    def test_second_device_restore_pull(self, db_client: TestClient, auth_headers) -> None:
        """
        Device A pushes data; Device B signs in to an empty localStorage,
        checks sync status (non-null timestamps), and pulls all records.
        After the pull, Device B holds the same records as Device A.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "restore-user")
        device_a_headers = auth_headers(user_id)
        device_b_headers = auth_headers(user_id)

        label_id = str(uuid4())

        # Device A — initial push (Branch A of first-sync flow)
        push_resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "DeviceA Label",
                        "color": "#112233",
                    }
                ]
            },
            headers=device_a_headers,
        )
        assert push_resp.status_code == 200

        # Device B — pre-flight check: status should show non-null labels_updated_at
        status_resp = db_client.get("/api/sync/status", headers=device_b_headers)
        assert status_resp.status_code == 200
        assert status_resp.json()["labels_updated_at"] is not None

        # Device B — full pull (no `since` → restores everything)
        pull_resp = db_client.get("/api/sync/pull", headers=device_b_headers)
        assert pull_resp.status_code == 200
        labels = pull_resp.json()["labels"]
        label_ids = [lbl["id"] for lbl in labels]
        assert label_id in label_ids

        # Device B now holds the same label that Device A pushed.
        restored_label = next(lbl for lbl in labels if lbl["id"] == label_id)
        assert restored_label["name"] == "DeviceA Label"

    # -------------------------------------------------------------------
    # §3 — Incremental pull across devices (ongoing sync)
    # -------------------------------------------------------------------

    def test_incremental_pull_with_since_across_devices(self, db_client: TestClient, auth_headers) -> None:
        """
        Device A pushes an initial label. Device B performs a full pull and
        stores the returned server_timestamp as its cursor. Device A later
        pushes an update. Device B pulls only the delta using the `since`
        cursor and receives only the updated record.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "incremental-user")
        device_a_headers = auth_headers(user_id)
        device_b_headers = auth_headers(user_id)

        label_id = str(uuid4())

        # Initial push from Device A.
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "Initial Name",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=device_a_headers,
        )

        # Device B — full pull; record the cursor.
        full_pull = db_client.get("/api/sync/pull", headers=device_b_headers)
        assert full_pull.status_code == 200
        cursor = full_pull.json()["server_timestamp"]
        assert cursor is not None

        # Brief pause to ensure the server's next updated_at is strictly greater.
        time.sleep(0.01)

        # Device A — push an update.
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(5),
                        "name": "Updated Name",
                    }
                ]
            },
            headers=device_a_headers,
        )

        # Device B — incremental pull using the stored cursor.
        incremental_pull = db_client.get("/api/sync/pull", params={"since": cursor}, headers=device_b_headers)
        assert incremental_pull.status_code == 200
        delta_labels = incremental_pull.json()["labels"]

        # Only the updated record should appear in the delta.
        assert len(delta_labels) == 1
        assert delta_labels[0]["id"] == label_id
        assert delta_labels[0]["name"] == "Updated Name"

    # -------------------------------------------------------------------
    # §3 — User data isolation (cross-user invariant)
    # -------------------------------------------------------------------

    def test_user_data_is_isolated_between_accounts(self, db_client: TestClient, auth_headers) -> None:
        """
        Records pushed by User A are never visible to User B's pull.
        This validates the per-user data isolation invariant.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_a_id = _create_user(db_client, admin_h, "isolation-user-a")
        user_b_id = _create_user(db_client, admin_h, "isolation-user-b")

        headers_a = auth_headers(user_a_id)
        headers_b = auth_headers(user_b_id)

        label_id = str(uuid4())

        # User A pushes a label.
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "User A Label",
                        "color": "#FACADE",
                    }
                ]
            },
            headers=headers_a,
        )

        # User B's pull must NOT include User A's label.
        pull_b = db_client.get("/api/sync/pull", headers=headers_b)
        assert pull_b.status_code == 200
        b_label_ids = [lbl["id"] for lbl in pull_b.json()["labels"]]
        assert label_id not in b_label_ids

        # User A's own pull must include the label.
        pull_a = db_client.get("/api/sync/pull", headers=headers_a)
        assert pull_a.status_code == 200
        a_label_ids = [lbl["id"] for lbl in pull_a.json()["labels"]]
        assert label_id in a_label_ids

    # -------------------------------------------------------------------
    # §5 — Concurrent edit conflict between devices
    # -------------------------------------------------------------------

    def test_concurrent_edit_conflict_between_devices(self, db_client: TestClient, auth_headers) -> None:
        """
        Both Device A and Device B edit the same record while offline.
        When both push, the later timestamp wins; the earlier push is
        rejected with status='conflict'.  The winning device's value is
        visible on the next full pull.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "concurrent-user")
        device_a_headers = auth_headers(user_id)
        device_b_headers = auth_headers(user_id)

        label_id = str(uuid4())

        # Both devices start from a common base: initial create.
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Base Name",
                        "color": "#000000",
                    }
                ]
            },
            headers=device_a_headers,
        )

        # Device A pushes an edit at t+10 (newer).
        resp_a = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(10),
                        "name": "Device A Edit",
                    }
                ]
            },
            headers=device_a_headers,
        )
        assert resp_a.status_code == 200
        assert resp_a.json()["results"]["labels"][0]["status"] == "ok"

        # Device B pushes a conflicting edit at t-5 (older — conflict).
        resp_b = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "name": "Device B Stale Edit",
                    }
                ]
            },
            headers=device_b_headers,
        )
        assert resp_b.status_code == 200
        result_b = resp_b.json()["results"]["labels"][0]
        assert result_b["status"] == "conflict"
        assert result_b["conflict_reason"] == "server version is newer"

        # Full pull must reflect Device A's winning edit.
        pull_resp = db_client.get("/api/sync/pull", headers=device_b_headers)
        assert pull_resp.status_code == 200
        labels = [lbl for lbl in pull_resp.json()["labels"] if lbl["id"] == label_id]
        assert len(labels) == 1
        assert labels[0]["name"] == "Device A Edit"

    # -------------------------------------------------------------------
    # §3 — Offline outbox scenario: push failure followed by reconnect
    # -------------------------------------------------------------------

    def test_outbox_flush_on_reconnect(self, db_client: TestClient, auth_headers) -> None:
        """
        Simulates an offline-then-reconnect scenario:
        1. Device pushes a batch of queued (outbox) records in a single flush.
        2. The server accepts all records.
        3. A subsequent pull returns all flushed records.

        The backend treats a large-batch push the same as individual writes,
        so this test validates that the outbox flush call pattern works.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "outbox-user")
        headers = auth_headers(user_id)

        # Simulate multiple queued changes from the outbox (merged into one request).
        # Each task has a distinct stop_time (rather than all-running) since only
        # one running task is allowed per user — see test_push_second_running_task_conflicts.
        task_ids = [str(uuid4()) for _ in range(3)]
        outbox_payload = {
            "tasks": [
                {
                    "id": task_id,
                    "action": "create",
                    "client_updated_at": _ts(-30 + i),
                    "text": f"Queued task {i}",
                    "label_id": None,
                    "start_time": "2026-02-01T09:00:00+00:00",
                    "stop_time": "2026-02-01T10:00:00+00:00",
                    "includes_break": False,
                }
                for i, task_id in enumerate(task_ids)
            ]
        }

        flush_resp = db_client.post("/api/sync/push", json=outbox_payload, headers=headers)
        assert flush_resp.status_code == 200

        results = flush_resp.json()["results"]["tasks"]
        assert all(r["status"] == "ok" for r in results), results

        # Reconnect pull: all flushed records must be present.
        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        assert pull_resp.status_code == 200
        pulled_task_ids = {task["id"] for task in pull_resp.json()["tasks"]}
        for task_id in task_ids:
            assert task_id in pulled_task_ids

    # -------------------------------------------------------------------
    # §2 — First-sync status endpoint reflects all entity types
    # -------------------------------------------------------------------

    def test_sync_status_reflects_all_entity_types(self, db_client: TestClient, auth_headers) -> None:
        """
        After pushing data for every synced entity type, the status
        endpoint must report a non-null timestamp for each entity.
        This validates the Branch A / Branch B detection logic used by
        useFirstSyncFlow on the frontend.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "status-all-user")
        headers = auth_headers(user_id)

        # Initial status — all null.
        status_before = db_client.get("/api/sync/status", headers=headers).json()
        assert status_before["labels_updated_at"] is None
        assert status_before["tasks_updated_at"] is None
        assert status_before["templates_updated_at"] is None
        assert status_before["work_locations_updated_at"] is None
        assert status_before["time_off_entries_updated_at"] is None
        assert status_before["preferences_updated_at"] is None

        label_id = str(uuid4())
        task_id = str(uuid4())
        template_id = str(uuid4())
        time_off_id = str(uuid4())

        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "Status Label",
                        "color": "#AABBCC",
                    }
                ],
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Status Task",
                        "label_id": None,
                        "start_time": "2026-03-01T08:00:00+00:00",
                        "stop_time": None,
                        "includes_break": False,
                    }
                ],
                "templates": [
                    {
                        "id": template_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Status Template",
                        "label_id": None,
                        "start_time": "08:00:00",
                        "stop_time": "12:00:00",
                    }
                ],
                "work_locations": [
                    {
                        "date": "2026-03-01",
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "country_code": "NL",
                    }
                ],
                "time_off_entries": [
                    {
                        "id": time_off_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "entry_kind": "date",
                        "date": "2026-07-01",
                        "entry_type": "vacation",
                        "entry_flag": "full_day",
                    }
                ],
            },
            headers=headers,
        )

        # Preferences are written via the dedicated endpoint, not /db/sync/push.
        db_client.put(
            "/api/preferences",
            json={"data": {"hasCompletedOnboarding": True}, "client_updated_at": _ts(-5)},
            headers=headers,
        )

        status_after = db_client.get("/api/sync/status", headers=headers).json()
        assert status_after["labels_updated_at"] is not None
        assert status_after["tasks_updated_at"] is not None
        assert status_after["templates_updated_at"] is not None
        assert status_after["work_locations_updated_at"] is not None
        assert status_after["time_off_entries_updated_at"] is not None
        assert status_after["preferences_updated_at"] is not None


# ---------------------------------------------------------------------------
# SSE events endpoint tests
# ---------------------------------------------------------------------------


class TestSyncEventManager:
    """Unit tests for SyncEventManager — subscribe, unsubscribe, broadcast."""

    async def test_broadcast_to_no_connections_returns_zero(self) -> None:
        manager = SyncEventManager()
        count = await manager.broadcast_sync_changed(user_id=99999)
        assert count == 0

    async def test_subscribe_and_broadcast_delivers_message(self) -> None:
        manager = SyncEventManager()
        queue: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=1, queue=queue)

        count = await manager.broadcast_sync_changed(user_id=1)
        assert count == 1

        msg = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert "event: sync_changed\n" in msg
        assert '"type": "sync_changed"' in msg or '"type":"sync_changed"' in msg
        assert "server_timestamp" in msg

    async def test_broadcast_message_format_matches_sse_spec(self) -> None:
        """SSE frame must follow the wire format defined in the SSE endpoint implementation."""
        manager = SyncEventManager()
        queue: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=1, queue=queue)
        await manager.broadcast_sync_changed(user_id=1)

        raw = await asyncio.wait_for(queue.get(), timeout=1.0)
        lines = raw.strip().split("\n")
        assert lines[0] == "event: sync_changed"
        assert lines[1].startswith("data: ")

        payload = json.loads(lines[1][len("data: ") :])
        assert payload["type"] == "sync_changed"
        assert "server_timestamp" in payload
        # server_timestamp must be parseable as ISO-8601
        datetime.fromisoformat(payload["server_timestamp"])

    async def test_unsubscribe_stops_delivery(self) -> None:
        manager = SyncEventManager()
        queue: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=1, queue=queue)
        manager.unsubscribe(user_id=1, queue=queue)

        count = await manager.broadcast_sync_changed(user_id=1)
        assert count == 0

    async def test_broadcast_is_isolated_per_user(self) -> None:
        """Events for user A must not reach user B's queue."""
        manager = SyncEventManager()
        q_a: asyncio.Queue[str] = asyncio.Queue()
        q_b: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=1, queue=q_a)
        manager.subscribe(user_id=2, queue=q_b)

        await manager.broadcast_sync_changed(user_id=1)
        assert not q_a.empty()
        assert q_b.empty()

    async def test_multiple_connections_same_user_all_notified(self) -> None:
        manager = SyncEventManager()
        q1: asyncio.Queue[str] = asyncio.Queue()
        q2: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=1, queue=q1)
        manager.subscribe(user_id=1, queue=q2)

        count = await manager.broadcast_sync_changed(user_id=1)
        assert count == 2
        assert not q1.empty()
        assert not q2.empty()

    async def test_subscribe_rejects_past_the_per_user_cap(self) -> None:
        """A single user can't accumulate unbounded concurrent SSE connections.

        The endpoint is exempt from the ordinary per-IP rate limiter (a stream
        is one long-lived connection, not one unit of request work), so this
        cap is what actually bounds one account's concurrent streams.
        """
        from app.utils.sse_manager import _MAX_QUEUES_PER_USER

        manager = SyncEventManager()
        queues = [asyncio.Queue() for _ in range(_MAX_QUEUES_PER_USER)]
        for q in queues:
            assert manager.subscribe(user_id=1, queue=q) is True

        overflow: asyncio.Queue[str] = asyncio.Queue()
        assert manager.subscribe(user_id=1, queue=overflow) is False

        # Freeing a slot lets a new connection back in.
        manager.unsubscribe(user_id=1, queue=queues[0])
        assert manager.subscribe(user_id=1, queue=overflow) is True

    async def test_coalescing_drops_duplicate_when_queue_full(self) -> None:
        """A full maxsize=1 queue silently drops the second hint (via public API)."""
        manager = SyncEventManager()
        # Use a bounded queue matching what the SSE endpoint creates.
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
        manager.subscribe(user_id=1, queue=queue)

        # First call fills the queue (no Postgres connection → local fallback).
        count1 = await manager.broadcast_sync_changed(user_id=1)
        assert count1 == 1
        assert queue.full()

        # Second call: queue is already full so the duplicate hint is dropped.
        count2 = await manager.broadcast_sync_changed(user_id=1)
        assert count2 == 0
        assert queue.qsize() == 1  # still exactly one pending message

    def test_pg_listener_callback_enqueues_locally(self) -> None:
        """_pg_listener_callback parses user_id and calls _enqueue_local."""
        manager = SyncEventManager()
        queue: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=7, queue=queue)

        with patch.object(manager, "_enqueue_local", wraps=manager._enqueue_local) as spy:
            manager._pg_listener_callback(conn=MagicMock(), pid=12345, channel="worktime_sync_changed", payload="7")
            spy.assert_called_once_with(7)
        assert not queue.empty()

    def test_pg_listener_callback_ignores_invalid_payload(self) -> None:
        """_pg_listener_callback logs a warning and does nothing for non-integer payloads."""
        manager = SyncEventManager()
        queue: asyncio.Queue[str] = asyncio.Queue()
        manager.subscribe(user_id=1, queue=queue)

        # Should not raise; queue must remain empty.
        manager._pg_listener_callback(
            conn=MagicMock(), pid=12345, channel="worktime_sync_changed", payload="not-an-int"
        )
        assert queue.empty()

    async def test_start_pg_listener_does_not_log_password_for_empty_url(self, caplog) -> None:
        """An empty db_url is rejected without ever logging a password."""
        manager = SyncEventManager()
        with caplog.at_level(logging.WARNING):
            await manager.start_pg_listener("")
        assert "hunter2" not in caplog.text

    async def test_start_pg_listener_does_not_log_password_for_wrong_scheme(self, caplog) -> None:
        """A malformed URL with embedded credentials is rejected without leaking the password."""
        manager = SyncEventManager()
        with caplog.at_level(logging.WARNING):
            await manager.start_pg_listener("postgresql://user:hunter2@host:5432/db")
        assert "hunter2" not in caplog.text
        assert "does not start with" in caplog.text


class TestSyncEventManagerReconnect:
    """Unit tests for issue #1102 — reconnecting dropped LISTEN/NOTIFY connections."""

    async def test_termination_schedules_reconnect_for_listen(self) -> None:
        """An unexpected termination of the listen connection clears it and
        schedules a reconnect task, instead of leaving the manager permanently
        without cross-process delivery.
        """
        manager = SyncEventManager()
        manager._closing = False
        manager._db_url = "postgresql://irrelevant/db"

        with patch.object(manager, "_connect_listen", new_callable=AsyncMock) as mock_connect:
            manager._on_pg_conn_terminated("listen", MagicMock())
            task = manager._reconnect_tasks["listen"]
            await asyncio.wait_for(task, timeout=1.0)

        assert manager._listen_conn is None
        mock_connect.assert_awaited_once()

    async def test_termination_schedules_reconnect_for_notify(self) -> None:
        manager = SyncEventManager()
        manager._closing = False
        manager._db_url = "postgresql://irrelevant/db"

        with patch.object(manager, "_connect_notify", new_callable=AsyncMock) as mock_connect:
            manager._on_pg_conn_terminated("notify", MagicMock())
            task = manager._reconnect_tasks["notify"]
            await asyncio.wait_for(task, timeout=1.0)

        assert manager._notify_conn is None
        mock_connect.assert_awaited_once()

    async def test_intentional_close_does_not_schedule_reconnect(self) -> None:
        """stop_pg_listener sets _closing first, so the termination listener
        it triggers must not schedule a reconnect (that would fight the
        deliberate shutdown).
        """
        manager = SyncEventManager()
        manager._closing = True

        with patch.object(manager, "_connect_listen", new_callable=AsyncMock) as mock_connect:
            manager._on_pg_conn_terminated("listen", MagicMock())

        assert manager._reconnect_tasks == {}
        mock_connect.assert_not_awaited()

    async def test_reconnect_does_not_duplicate_when_already_in_flight(self) -> None:
        """A second termination signal while a reconnect is still running for
        the same connection must not spawn a competing reconnect task.
        """
        manager = SyncEventManager()
        manager._closing = False
        manager._db_url = "postgresql://irrelevant/db"

        started = asyncio.Event()
        release = asyncio.Event()

        async def _slow_connect() -> None:
            started.set()
            await release.wait()

        with patch.object(manager, "_connect_listen", new_callable=AsyncMock, side_effect=_slow_connect):
            manager._on_pg_conn_terminated("listen", MagicMock())
            await asyncio.wait_for(started.wait(), timeout=1.0)
            first_task = manager._reconnect_tasks["listen"]

            manager._on_pg_conn_terminated("listen", MagicMock())
            assert manager._reconnect_tasks["listen"] is first_task

            release.set()
            await asyncio.wait_for(first_task, timeout=1.0)

    async def test_reconnect_with_backoff_retries_until_success(self) -> None:
        """A reconnect attempt that fails is retried (not given up on) and
        succeeds once the underlying connect call stops raising.
        """
        manager = SyncEventManager()
        manager._closing = False

        with (
            patch.object(
                manager, "_connect_listen", new_callable=AsyncMock, side_effect=[OSError("down"), None]
            ) as mock_connect,
            patch("app.utils.sse_manager.asyncio.sleep", new_callable=AsyncMock),
        ):
            await manager._reconnect_with_backoff("listen")

        assert mock_connect.await_count == 2

    async def test_reconnect_with_backoff_stops_when_closing(self) -> None:
        """The retry loop exits once stop_pg_listener sets _closing, instead of
        retrying forever after a deliberate shutdown.
        """
        manager = SyncEventManager()
        manager._closing = False

        async def _fail_and_close(*args, **kwargs) -> None:
            manager._closing = True
            raise OSError("down")

        with (
            patch.object(manager, "_connect_listen", new_callable=AsyncMock, side_effect=_fail_and_close),
            patch("app.utils.sse_manager.asyncio.sleep", new_callable=AsyncMock),
        ):
            await manager._reconnect_with_backoff("listen")

    async def test_stop_pg_listener_cancels_in_flight_reconnect(self) -> None:
        """stop_pg_listener must cancel a still-running reconnect task rather
        than leaving it retrying against a manager that has moved on.
        """
        manager = SyncEventManager()
        manager._closing = False
        manager._db_url = "postgresql://irrelevant/db"

        release = asyncio.Event()

        async def _hang(*args, **kwargs) -> None:
            await release.wait()

        with patch.object(manager, "_connect_listen", new_callable=AsyncMock, side_effect=_hang):
            manager._on_pg_conn_terminated("listen", MagicMock())
            task = manager._reconnect_tasks["listen"]
            await asyncio.sleep(0)  # let the task start and await release

            await manager.stop_pg_listener()

            assert task.cancelled()
        release.set()


class TestRedactCredentials:
    """Unit tests for the _redact_credentials logging helper."""

    def test_redacts_password_from_url(self) -> None:
        redacted = _redact_credentials("postgresql+asyncpg://user:hunter2@host:5432/db")
        assert "hunter2" not in redacted
        assert redacted == "postgresql+asyncpg://user:***@host:5432/db"

    def test_passes_through_url_without_credentials(self) -> None:
        assert _redact_credentials("postgresql+asyncpg://host:5432/db") == "postgresql+asyncpg://host:5432/db"

    def test_handles_non_string_input(self) -> None:
        assert _redact_credentials(None) == "None"

    def test_handles_unparseable_input(self) -> None:
        # A lone '[' is invalid per RFC 3986 bracket-matching and raises in urlparse.
        assert _redact_credentials("postgresql://[") == "<unparseable>"


class TestSyncEventsEndpoint:
    """GET /api/sync/events — HTTP-level tests for the SSE endpoint."""

    async def test_events_endpoint_content_type(self) -> None:
        """events_endpoint returns a StreamingResponse with the correct SSE headers."""
        from fastapi import Request

        from app.routers.db_sync import events_endpoint

        mock_request = MagicMock(spec=Request)

        response = await events_endpoint(
            request=mock_request,
            authenticated_user_id=42,
        )

        assert response.media_type == "text/event-stream"
        assert response.headers.get("cache-control") == "no-cache"
        assert response.headers.get("x-accel-buffering") == "no"

        # Close the body iterator so the manager's finally block runs and
        # unsubscribes the connection from the SyncEventManager. body_iterator
        # is typed as a plain AsyncIterable by Starlette, which doesn't
        # guarantee aclose() at the type level even though it's always an
        # async generator here at runtime.
        await cast("AsyncGenerator[Any, None]", response.body_iterator).aclose()

    async def test_events_endpoint_rejects_past_the_per_user_cap(self) -> None:
        """A 429 is raised (not a StreamingResponse) once one user hits the
        per-user connection cap — see test_subscribe_rejects_past_the_per_user_cap
        for the SyncEventManager-level unit test this exercises end-to-end.
        """
        import pytest
        from fastapi import HTTPException, Request

        from app.routers.db_sync import events_endpoint
        from app.utils.sse_manager import _MAX_QUEUES_PER_USER

        mock_request = MagicMock(spec=Request)
        user_id = 987654321  # unique to this test to avoid cross-test interference
        responses = []
        try:
            for _ in range(_MAX_QUEUES_PER_USER):
                responses.append(await events_endpoint(request=mock_request, authenticated_user_id=user_id))

            with pytest.raises(HTTPException) as exc_info:
                await events_endpoint(request=mock_request, authenticated_user_id=user_id)
            assert exc_info.value.status_code == 429
        finally:
            for response in responses:
                await cast("AsyncGenerator[Any, None]", response.body_iterator).aclose()

    def test_push_still_returns_200_when_broadcast_raises(self, db_client: TestClient, auth_headers) -> None:
        """Push must succeed even if broadcast_sync_changed raises an exception."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "events-error-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())

        with patch(
            "app.routers.db_sync.sync_event_manager.broadcast_sync_changed",
            new_callable=AsyncMock,
            side_effect=RuntimeError("broadcast failed"),
        ):
            resp = db_client.post(
                "/api/sync/push",
                json={
                    "labels": [
                        {
                            "id": label_id,
                            "action": "create",
                            "client_updated_at": _ts(-5),
                            "name": "Error Test",
                            "color": "#DDEEFF",
                        }
                    ]
                },
                headers=headers,
            )
            # Push must succeed despite broadcast failure.
            assert resp.status_code == 200

    def test_push_triggers_broadcast_to_connected_client(self, db_client: TestClient, auth_headers) -> None:
        """After a successful push, broadcast_sync_changed is called for the pushing user."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "events-push-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())

        with patch("app.routers.db_sync.sync_event_manager.broadcast_sync_changed", new_callable=AsyncMock) as mock_bc:
            mock_bc.return_value = 0
            resp = db_client.post(
                "/api/sync/push",
                json={
                    "labels": [
                        {
                            "id": label_id,
                            "action": "create",
                            "client_updated_at": _ts(-5),
                            "name": "Broadcast Test",
                            "color": "#AABBCC",
                        }
                    ]
                },
                headers=headers,
            )
            assert resp.status_code == 200
            mock_bc.assert_called_once_with(user_id)


class TestSyncEventsConnectionPool:
    """Regression test for #1099: SSE auth must not pin a pooled DB connection
    for the stream's lifetime, exhausting the pool under concurrent tabs.
    """

    async def test_shortlived_auth_does_not_exhaust_connection_pool(self, test_db: AsyncEngine, monkeypatch) -> None:
        """N > pool_size + max_overflow concurrent auth resolutions, followed by
        an ordinary query, must not exhaust the pool.

        ``get_principal_shortlived`` (used by the SSE route in place of the
        request-scoped ``get_session``) is exactly where the fix lives: it
        opens its own session, runs the auth lookup, and closes it — all
        before the route ever returns its ``StreamingResponse``. Exercising
        it directly against a deliberately tiny pool reproduces the bug
        scenario without needing a real long-lived HTTP connection: before
        the fix, each call would have pinned a connection for the *stream's*
        lifetime (via the request-scoped ``get_session``) rather than
        releasing it once auth resolves, so ``num_calls`` concurrent
        resolutions would exhaust the 2-connection pool below and the final
        ordinary query would time out waiting for one.
        """
        from sqlalchemy import text as sql_text
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from sqlalchemy.pool import QueuePool

        import app.database.engine as db_engine
        from app.routers.auth import get_principal_shortlived

        pool_size, max_overflow = 1, 1  # total capacity: 2 pooled connections
        small_engine = create_async_engine(
            test_db.url.render_as_string(hide_password=False),
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=2,
        )
        small_factory = async_sessionmaker(small_engine, expire_on_commit=False)
        # app.database.engine exposes no setter/override for the module-level
        # engine and session factory, so swapping them in for this test means
        # patching the private globals directly.
        monkeypatch.setattr(db_engine, "_engine", small_engine)
        monkeypatch.setattr(db_engine, "_session_factory", small_factory)

        fake_claims = {"sub": "pool-test-subject", "realm_access": {"roles": []}}
        monkeypatch.setattr("app.routers.auth.decode_token", AsyncMock(return_value=fake_claims))
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="faketoken")

        num_calls = pool_size + max_overflow + 3

        try:
            principals = await asyncio.wait_for(
                asyncio.gather(*(get_principal_shortlived(MagicMock(), credentials) for _ in range(num_calls))),
                timeout=10,
            )
            assert len(principals) == num_calls
            assert all(p.user_id == principals[0].user_id for p in principals)

            # Every session opened above must have released its connection —
            # none should still be checked out now that all calls returned.
            assert cast("QueuePool", small_engine.pool).checkedout() == 0

            # An ordinary request must still get a connection immediately.
            async with small_factory() as session:
                await asyncio.wait_for(session.execute(sql_text("SELECT 1")), timeout=2)
        finally:
            await small_engine.dispose()


# ---------------------------------------------------------------------------
# Regression tests for sync correctness fixes
# ---------------------------------------------------------------------------


class TestSyncCorrectnessFixes:
    """Regression tests for LWW/cursor correctness fixes."""

    def test_sync_label_delete_ignores_soft_deleted_references(self, db_client: TestClient, auth_headers) -> None:
        """A label whose only referencing tasks are soft-deleted must be deletable.

        Previously the sync push counted soft-deleted tasks as active references,
        making the label permanently undeletable via sync (while the REST path
        allowed it) — every outbox flush re-surfaced a bogus conflict.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-tombstone-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        task_id = str(uuid4())

        create_resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Tombstoned",
                        "color": "#AABBCC",
                    }
                ],
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "text": "Uses label",
                        "label_id": label_id,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ],
            },
            headers=headers,
        )
        assert create_resp.status_code == 200

        # Soft-delete the referencing task, then delete the label.
        delete_task_resp = db_client.post(
            "/api/sync/push",
            json={"tasks": [{"id": task_id, "action": "delete", "client_updated_at": _ts(-10)}]},
            headers=headers,
        )
        assert delete_task_resp.status_code == 200
        assert delete_task_resp.json()["results"]["tasks"][0]["status"] == "ok"

        delete_label_resp = db_client.post(
            "/api/sync/push",
            json={"labels": [{"id": label_id, "action": "delete", "client_updated_at": _ts(-5)}]},
            headers=headers,
        )
        assert delete_label_resp.status_code == 200
        result = delete_label_resp.json()["results"]["labels"][0]
        assert result["status"] == "ok", result

    def test_sync_label_delete_conflicts_on_active_reference(self, db_client: TestClient, auth_headers) -> None:
        """A label with an *active* referencing task must still refuse deletion."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-active-ref-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        task_id = str(uuid4())

        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Still Used",
                        "color": "#AABBCC",
                    }
                ],
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "text": "Active task",
                        "label_id": label_id,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ],
            },
            headers=headers,
        )

        delete_label_resp = db_client.post(
            "/api/sync/push",
            json={"labels": [{"id": label_id, "action": "delete", "client_updated_at": _ts(-5)}]},
            headers=headers,
        )
        assert delete_label_resp.status_code == 200
        result = delete_label_resp.json()["results"]["labels"][0]
        assert result["status"] == "conflict"
        assert "in use" in result["conflict_reason"]

    def test_sync_label_delete_conflicts_on_active_gantt_task_reference(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """A label with an *active* referencing Gantt task must still refuse deletion."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-gantt-ref-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        gantt_id = str(uuid4())

        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Still Used By Gantt",
                        "color": "#AABBCC",
                    }
                ],
                "gantt_tasks": [
                    {
                        "id": gantt_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Project referencing label",
                        "label_id": label_id,
                        "start_date": "2026-02-01",
                        "end_date": "2026-02-28",
                        "progress": 0,
                    }
                ],
            },
            headers=headers,
        )

        delete_label_resp = db_client.post(
            "/api/sync/push",
            json={"labels": [{"id": label_id, "action": "delete", "client_updated_at": _ts(-5)}]},
            headers=headers,
        )
        assert delete_label_resp.status_code == 200
        result = delete_label_resp.json()["results"]["labels"][0]
        assert result["status"] == "conflict"
        assert "in use" in result["conflict_reason"]

        # And the reverse: creating/updating a Gantt task with a bogus label_id
        # via sync push must fail as a validation error, not a 500.
        bad_gantt_resp = db_client.post(
            "/api/sync/push",
            json={
                "gantt_tasks": [
                    {
                        "id": str(uuid4()),
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "Bad label ref",
                        "label_id": "does-not-exist",
                        "start_date": "2026-02-01",
                        "end_date": "2026-02-28",
                        "progress": 0,
                    }
                ]
            },
            headers=headers,
        )
        assert bad_gantt_resp.status_code == 400

    def test_push_task_create_rejects_stop_time_before_start_time(self, db_client: TestClient, auth_headers) -> None:
        """Sync push must reject an inverted time range, matching the REST create_task check.

        The REST path (db_service.create_task) already rejects
        stop_time < start_time; the sync push path had no equivalent check,
        so a client could silently write a negative-duration task that the
        REST API would have refused.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "task-time-order-create-user")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": str(uuid4()),
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Inverted range",
                        "label_id": None,
                        "start_time": "2026-02-01T10:00:00+00:00",
                        "stop_time": "2026-02-01T09:00:00+00:00",
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 400

    def test_push_task_update_rejects_stop_time_before_effective_start_time(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """The same check must apply to a partial update, using the merged start/stop times."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "task-time-order-update-user")
        headers = auth_headers(user_id)

        task_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "text": "Valid range",
                        "label_id": None,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )

        # Only start_time is updated (to after the existing stop_time) — the
        # check must use the *effective* stop_time (unchanged), not skip
        # validation just because stop_time wasn't part of this payload.
        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "start_time": "2026-02-01T11:00:00+00:00",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 400

    def test_push_gantt_task_create_rejects_end_date_before_start_date(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """Sync push must reject an inverted date range, matching the REST create_gantt_task check.

        Reproduces #1105: the REST path (GanttTaskCreate.validate_date_range)
        already rejects end_date < start_date; the sync push path had no
        equivalent check, so a client could silently write an inverted gantt
        task that the REST API would have refused. The create case is caught
        by GanttTaskSyncItem's own model_validator (a request-shape problem,
        like the pre-existing missing-fields check beside it), so it 422s
        like the REST create endpoint rather than 400ing like a service-level
        ValidationError.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "gantt-date-order-create-user")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/sync/push",
            json={
                "gantt_tasks": [
                    {
                        "id": str(uuid4()),
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "Inverted range",
                        "label_id": None,
                        "start_date": "2026-02-10",
                        "end_date": "2026-02-01",
                        "progress": 0,
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 422

    def test_push_gantt_task_update_rejects_end_date_before_effective_start_date(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """The same check must apply to a partial update, using the merged start/end dates."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "gantt-date-order-update-user")
        headers = auth_headers(user_id)

        task_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "gantt_tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "Valid range",
                        "label_id": None,
                        "start_date": "2026-02-01",
                        "end_date": "2026-02-10",
                        "progress": 0,
                    }
                ]
            },
            headers=headers,
        )

        # Only start_date is updated (to after the existing end_date) — the
        # check must use the *effective* end_date (unchanged), not skip
        # validation just because end_date wasn't part of this payload.
        resp = db_client.post(
            "/api/sync/push",
            json={
                "gantt_tasks": [
                    {
                        "id": task_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "start_date": "2026-02-15",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 400

    def test_push_second_running_task_conflicts(self, db_client: TestClient, auth_headers) -> None:
        """Sync push must reject a second running task, matching db_service.create_task.

        Reproduces #1100: two devices each start a task offline, then both
        push. Without this check both creates would land as `stop_time IS
        NULL` rows, and every endpoint resolving the running task via
        `get_running_task` would later crash on `MultipleResultsFound`.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "two-running-tasks-user")
        headers = auth_headers(user_id)

        first_id = str(uuid4())
        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": first_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "text": "Device A running task",
                        "label_id": None,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": None,
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["results"]["tasks"][0]["status"] == "ok"

        second_id = str(uuid4())
        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": second_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Device B running task",
                        "label_id": None,
                        "start_time": "2026-02-01T09:05:00+00:00",
                        "stop_time": None,
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        result = resp.json()["results"]["tasks"][0]
        assert result["status"] == "conflict"
        assert result["conflict_reason"] == "only one running task is allowed per user"

        # The first task remains the sole running task.
        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        running = [t for t in pull_resp.json()["tasks"] if t["stop_time"] is None]
        assert [t["id"] for t in running] == [first_id]

    def test_push_update_clearing_stop_time_conflicts_with_existing_running_task(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """Reopening a completed task (clearing stop_time) must not create a second running task."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "reopen-task-user")
        headers = auth_headers(user_id)

        running_id = str(uuid4())
        completed_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": running_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "text": "Already running",
                        "label_id": None,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": None,
                        "includes_break": False,
                    },
                    {
                        "id": completed_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "text": "Completed earlier",
                        "label_id": None,
                        "start_time": "2026-02-01T07:00:00+00:00",
                        "stop_time": "2026-02-01T08:00:00+00:00",
                        "includes_break": False,
                    },
                ]
            },
            headers=headers,
        )

        # Clearing stop_time on the completed task would reopen it, creating
        # a second running task alongside `running_id`.
        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": completed_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "stop_time": None,
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        result = resp.json()["results"]["tasks"][0]
        assert result["status"] == "conflict"
        assert result["conflict_reason"] == "only one running task is allowed per user"

    async def test_concurrent_running_task_pushes_return_conflict_not_500(self, test_db: AsyncEngine) -> None:
        """Two genuinely concurrent pushes racing to start a running task must not 500 the batch.

        `_user_has_other_running_task`'s preflight check closes the ordinary
        sequential-push race (see the two tests above), but two literally
        concurrent requests for the same user can both pass it before either
        commits — `uq_active_running_task_user` is the backstop for that
        case. Without `_add_task_or_running_conflict`'s savepoint, the
        resulting IntegrityError would propagate out of `_push_task` and
        abort the whole batch (push_changes commits once at the end) instead
        of surfacing as this one record's conflict.

        Simulated with two real sessions: session A inserts (but doesn't yet
        commit) a running task directly, session B then runs `_push_task`
        for a second one — its preflight check passes (A isn't committed
        yet), so its INSERT blocks on Postgres's uncommitted conflicting
        index entry until A commits, then fails uniqueness.

        Spies on `_add_task_or_running_conflict` so the test fails loudly if
        timing ever let the preflight check (rather than the savepoint this
        test targets) resolve the conflict instead.
        """
        from app.services import sync_service

        factory = async_sessionmaker(test_db, expire_on_commit=False)
        async with factory() as setup_session:
            user = await create_user(setup_session, UserCreate(username="race-user", display_name="Race"))
            await setup_session.commit()
            user_id = user.id

        session_a = factory()
        session_b = factory()
        a_inserted = asyncio.Event()

        async def racer_a() -> None:
            session_a.add(
                TimeTrackingTask(
                    id=str(uuid4()),
                    user_id=user_id,
                    text="Racer A",
                    start_time=datetime(2026, 2, 1, 9, 0, tzinfo=UTC),
                    stop_time=None,
                    client_updated_at=datetime.now(UTC),
                )
            )
            await session_a.flush()
            a_inserted.set()
            # Hold the uncommitted row long enough for racer_b's preflight
            # check and blocking INSERT to both be underway.
            await asyncio.sleep(0.3)
            await session_a.commit()

        async def racer_b():
            await a_inserted.wait()
            item = TaskSyncItem(
                id=str(uuid4()),
                action="create",
                client_updated_at=datetime.now(UTC),
                text="Racer B",
                start_time=datetime(2026, 2, 1, 9, 5, tzinfo=UTC),
                stop_time=None,
            )
            result = await _push_task(session_b, user_id, item)
            await session_b.commit()
            return result

        with patch.object(
            sync_service, "_add_task_or_running_conflict", wraps=sync_service._add_task_or_running_conflict
        ) as spy:
            try:
                _, result_b = await asyncio.gather(racer_a(), racer_b())
            finally:
                await session_a.close()
                await session_b.close()

        assert result_b.status == "conflict"
        assert result_b.conflict_reason == "only one running task is allowed per user"
        spy.assert_called_once()

    async def test_concurrent_running_task_reopen_returns_conflict_not_500(self, test_db: AsyncEngine) -> None:
        """Two concurrent pushes racing on a *reopen* (not a create) must not abort the batch.

        Same race as the test above, but for the update path: reopening a
        completed task (clearing stop_time) mutates an already-persistent,
        already-dirty `task` object before `_add_task_or_running_conflict` is
        called. `session.begin_nested()` unconditionally flushes any dirty
        session state *before* it establishes the SAVEPOINT, so if those
        mutations were applied directly (rather than deferred via the `apply`
        callback), the constraint violation would be raised by that
        pre-SAVEPOINT flush — outside the savepoint's protection, leaving the
        session's transaction aborted rather than yielding a clean per-record
        conflict. Asserting `session_b.commit()` succeeds afterward is the
        actual regression check: before the fix, the aborted transaction
        would make it raise.
        """
        factory = async_sessionmaker(test_db, expire_on_commit=False)
        async with factory() as setup_session:
            user = await create_user(setup_session, UserCreate(username="reopen-race-user", display_name="Race"))
            completed_task = TimeTrackingTask(
                id=str(uuid4()),
                user_id=user.id,
                text="Completed earlier",
                start_time=datetime(2026, 2, 1, 7, 0, tzinfo=UTC),
                stop_time=datetime(2026, 2, 1, 8, 0, tzinfo=UTC),
                client_updated_at=datetime.now(UTC),
            )
            setup_session.add(completed_task)
            await setup_session.commit()
            user_id = user.id
            completed_task_id = completed_task.id

        session_a = factory()
        session_b = factory()
        a_inserted = asyncio.Event()

        async def racer_a() -> None:
            session_a.add(
                TimeTrackingTask(
                    id=str(uuid4()),
                    user_id=user_id,
                    text="Racer A",
                    start_time=datetime(2026, 2, 1, 9, 0, tzinfo=UTC),
                    stop_time=None,
                    client_updated_at=datetime.now(UTC),
                )
            )
            await session_a.flush()
            a_inserted.set()
            # Hold the uncommitted row long enough for racer_b's preflight
            # check and blocking UPDATE to both be underway.
            await asyncio.sleep(0.3)
            await session_a.commit()

        async def racer_b():
            await a_inserted.wait()
            item = TaskSyncItem(
                id=completed_task_id,
                action="update",
                client_updated_at=datetime.now(UTC),
                stop_time=None,
            )
            result = await _push_task(session_b, user_id, item)
            await session_b.commit()
            return result

        try:
            _, result_b = await asyncio.gather(racer_a(), racer_b())
        finally:
            await session_a.close()
            await session_b.close()

        assert result_b.status == "conflict"
        assert result_b.conflict_reason == "only one running task is allowed per user"

        # The reopen was rejected: the task must still be completed, not
        # dangling half-mutated from the aborted-transaction failure mode.
        async with factory() as verify_session:
            reloaded = await verify_session.get(TimeTrackingTask, completed_task_id)
            assert reloaded is not None
            assert reloaded.stop_time is not None

    def test_push_client_updated_at_is_clamped_to_prevent_permanent_lww_lock(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """A wildly-future client_updated_at (bad clock / unit bug) must not permanently win LWW.

        Conflict detection is a pure `>` comparison with no other tiebreaker,
        so an unclamped record stamped far in the future would win every
        future comparison forever — including a later correction from the
        *same* device once its clock is fixed. The server clamps the stored
        value to _MAX_CLOCK_SKEW ahead of its own clock, so a legitimate,
        further-future edit from another device with a sane clock can still
        win.
        """
        from app.services.sync_service import _MAX_CLOCK_SKEW

        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "clock-skew-user")
        headers = auth_headers(user_id)

        task_id = str(uuid4())
        bogus_future = (datetime.now(UTC) + timedelta(days=3650)).isoformat()

        create_resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": bogus_future,
                        "text": "Created with a broken clock",
                        "label_id": None,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )
        assert create_resp.status_code == 200
        assert create_resp.json()["results"]["tasks"][0]["status"] == "ok"

        # A legitimate edit stamped further ahead than the clamp ceiling must
        # still win — proving the bogus value did not get stored as-is.
        legitimate_future_edit = (datetime.now(UTC) + _MAX_CLOCK_SKEW + timedelta(minutes=1)).isoformat()
        edit_resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "update",
                        "client_updated_at": legitimate_future_edit,
                        "text": "Fixed-clock correction wins",
                    }
                ]
            },
            headers=headers,
        )
        assert edit_resp.status_code == 200, edit_resp.text
        assert edit_resp.json()["results"]["tasks"][0]["status"] == "ok"

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        pulled = next(t for t in pull_resp.json()["tasks"] if t["id"] == task_id)
        assert pulled["text"] == "Fixed-clock correction wins"

    def test_pull_server_timestamp_includes_safety_overlap(self, db_client: TestClient, auth_headers) -> None:
        """The pull cursor must lag real time so concurrent pushes are not skipped.

        pull_changes subtracts _PULL_CURSOR_OVERLAP from the reported
        server_timestamp; without it, records committed concurrently with a
        pull could fall permanently behind the client's cursor.
        """
        from app.services.sync_service import _PULL_CURSOR_OVERLAP

        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "overlap-user")
        headers = auth_headers(user_id)

        before = datetime.now(UTC)
        resp = db_client.get("/api/sync/pull", headers=headers)
        after = datetime.now(UTC)
        assert resp.status_code == 200

        server_timestamp = datetime.fromisoformat(resp.json()["server_timestamp"])
        assert server_timestamp <= after - _PULL_CURSOR_OVERLAP + timedelta(seconds=1)
        assert server_timestamp >= before - _PULL_CURSOR_OVERLAP - timedelta(seconds=1)

        # The status endpoint's server_timestamp is also persisted as a cursor
        # by the frontend and must carry the same overlap.
        status_resp = db_client.get("/api/sync/status", headers=headers)
        assert status_resp.status_code == 200
        status_timestamp = datetime.fromisoformat(status_resp.json()["server_timestamp"])
        assert status_timestamp <= datetime.now(UTC) - _PULL_CURSOR_OVERLAP + timedelta(seconds=1)

    def test_push_batch_size_limit_enforced(self, db_client: TestClient, auth_headers) -> None:
        """A push batch exceeding MAX_SYNC_PUSH_ITEMS per entity list returns 422."""
        from app.schemas import MAX_SYNC_PUSH_ITEMS

        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "batch-limit-user")
        headers = auth_headers(user_id)

        oversized = {
            "labels": [
                {
                    "id": str(uuid4()),
                    "action": "create",
                    "client_updated_at": _ts(-5),
                    "name": f"Label {i}",
                    "color": "#AABBCC",
                }
                for i in range(MAX_SYNC_PUSH_ITEMS + 1)
            ]
        }
        resp = db_client.post("/api/sync/push", json=oversized, headers=headers)
        assert resp.status_code == 422

    def test_push_creating_two_labels_with_same_name_returns_conflict_not_500(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """Two devices independently creating a same-named label must not 500 the batch.

        uq_active_label_user_name is a partial unique index on (user_id,
        name); previously nothing checked for this before commit, so the
        second label's INSERT raised IntegrityError, which /sync/push did not
        catch — the whole batch (transaction) 500'd, and since the outbox
        retries the identical batch forever, the offending label wedged every
        other queued change behind it indefinitely.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-collision-create-user")
        headers = auth_headers(user_id)

        first_id = str(uuid4())
        second_id = str(uuid4())

        first_resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": first_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "Duplicate Name",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )
        assert first_resp.status_code == 200
        assert first_resp.json()["results"]["labels"][0]["status"] == "ok"

        # A different label id, same name — as if two devices both created a
        # "Duplicate Name" label offline before ever syncing.
        second_resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": second_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "Duplicate Name",
                        "color": "#DDEEFF",
                    }
                ]
            },
            headers=headers,
        )
        assert second_resp.status_code == 200, second_resp.text
        result = second_resp.json()["results"]["labels"][0]
        assert result["status"] == "conflict"
        assert "already exists" in result["conflict_reason"]

        # The first label is untouched and the second was never created.
        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        names = [label["name"] for label in pull_resp.json()["labels"] if label["deleted_at"] is None]
        assert names == ["Duplicate Name"]

    def test_push_creating_same_name_label_twice_in_one_batch_only_conflicts_the_second(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """The collision check must see earlier same-batch inserts (autoflush), not just committed rows."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-collision-batch-user")
        headers = auth_headers(user_id)

        first_id = str(uuid4())
        second_id = str(uuid4())

        resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": first_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "Same Batch",
                        "color": "#AABBCC",
                    },
                    {
                        "id": second_id,
                        "action": "create",
                        "client_updated_at": _ts(-9),
                        "name": "Same Batch",
                        "color": "#DDEEFF",
                    },
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["results"]["labels"]
        assert results[0]["status"] == "ok"
        assert results[1]["status"] == "conflict"

    def test_push_rename_colliding_with_another_active_label_returns_conflict(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """Renaming a label to a name already used by another active label must conflict, not 500."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-rename-collision-user")
        headers = auth_headers(user_id)

        keep_id = str(uuid4())
        rename_id = str(uuid4())

        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": keep_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Existing",
                        "color": "#AABBCC",
                    },
                    {
                        "id": rename_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Original",
                        "color": "#DDEEFF",
                    },
                ]
            },
            headers=headers,
        )

        rename_resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": rename_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "name": "Existing",
                    }
                ]
            },
            headers=headers,
        )
        assert rename_resp.status_code == 200, rename_resp.text
        result = rename_resp.json()["results"]["labels"][0]
        assert result["status"] == "conflict"
        assert "already exists" in result["conflict_reason"]

    def test_push_renaming_label_to_its_own_current_name_is_a_no_op_not_a_conflict(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """An update that doesn't actually change the name must not false-positive against itself."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-self-rename-user")
        headers = auth_headers(user_id)

        label_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-20),
                        "name": "Unchanged",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )

        resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "name": "Unchanged",
                        "color": "#112233",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["results"]["labels"][0]
        assert result["status"] == "ok"

    def test_push_reviving_soft_deleted_label_colliding_with_active_label_returns_conflict(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """Reviving a soft-deleted label must also respect the active-name uniqueness."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "label-revive-collision-user")
        headers = auth_headers(user_id)

        tombstoned_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": tombstoned_id,
                        "action": "create",
                        "client_updated_at": _ts(-30),
                        "name": "Revivable",
                        "color": "#AABBCC",
                    }
                ]
            },
            headers=headers,
        )
        db_client.post(
            "/api/sync/push",
            json={"labels": [{"id": tombstoned_id, "action": "delete", "client_updated_at": _ts(-20)}]},
            headers=headers,
        )

        # A new, active label claims the freed-up name while the first is tombstoned.
        new_active_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": new_active_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "Revivable",
                        "color": "#DDEEFF",
                    }
                ]
            },
            headers=headers,
        )

        # An old device, unaware of any of this, tries to revive its tombstoned label.
        revive_resp = db_client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": tombstoned_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "color": "#FFFFFF",
                    }
                ]
            },
            headers=headers,
        )
        assert revive_resp.status_code == 200, revive_resp.text
        result = revive_resp.json()["results"]["labels"][0]
        assert result["status"] == "conflict"
        assert "already exists" in result["conflict_reason"]

    def test_rest_update_wins_over_stale_sync_push(self, db_client: TestClient, auth_headers) -> None:
        """An edit made via the REST/MCP path must not be silently reverted.

        REST updates now bump client_updated_at, so a sync push carrying a
        client timestamp older than the REST edit (but newer than the record's
        original creation) is reported as a conflict instead of clobbering it.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "rest-lww-user")
        headers = auth_headers(user_id)

        task_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-60),
                        "text": "Original",
                        "label_id": None,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )

        # Edit via the REST path (same code path the MCP server uses).
        rest_resp = db_client.put(
            f"/api/time-tracking/tasks/{task_id}?user_id={user_id}",
            json={"text": "Edited via REST"},
            headers=headers,
        )
        assert rest_resp.status_code == 200

        # A stale device pushes an update stamped after creation but before
        # the REST edit — it must lose, not silently overwrite.
        stale_resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "update",
                        "client_updated_at": _ts(-30),
                        "text": "Stale offline edit",
                    }
                ]
            },
            headers=headers,
        )
        assert stale_resp.status_code == 200
        result = stale_resp.json()["results"]["tasks"][0]
        assert result["status"] == "conflict"

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        pulled = [t for t in pull_resp.json()["tasks"] if t["id"] == task_id]
        assert pulled[0]["text"] == "Edited via REST"

    def test_push_creates_gantt_linked_task_in_single_batch(self, db_client: TestClient, auth_headers) -> None:
        """A single batch may create a gantt task and a task linking to it.

        First-sync uploads send everything in one push; gantt tasks must be
        processed before time-tracking tasks or the gantt_task_id reference
        validation rejects the whole batch with 400.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "gantt-link-batch-user")
        headers = auth_headers(user_id)

        gantt_id = str(uuid4())
        task_id = str(uuid4())

        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": task_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Linked to gantt",
                        "label_id": None,
                        "gantt_task_id": gantt_id,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ],
                "gantt_tasks": [
                    {
                        "id": gantt_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "name": "Project A",
                        "start_date": "2026-02-01",
                        "end_date": "2026-02-28",
                        "progress": 0,
                    }
                ],
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["results"]
        assert results["gantt_tasks"][0]["status"] == "ok"
        assert results["tasks"][0]["status"] == "ok"

        pull_resp = db_client.get("/api/sync/pull", headers=headers)
        pulled = [t for t in pull_resp.json()["tasks"] if t["id"] == task_id]
        assert pulled[0]["gantt_task_id"] == gantt_id

    def test_push_task_with_nonexistent_gantt_reference_returns_400_not_500(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """A task linking to a gantt_task_id that doesn't exist must 400, not 500.

        _validate_task_gantt_reference raises NotFoundError (not
        ValidationError); the push endpoint previously only caught
        ValidationError, so this bubbled up as an unhandled 500. This is a
        plausible everyday race, not just a malformed-payload edge case: a
        task's gantt_task_id can go stale if another device deletes that
        gantt task between this device's last pull and its next push.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "gantt-ref-404-user")
        headers = auth_headers(user_id)

        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": str(uuid4()),
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Dangling gantt reference",
                        "label_id": None,
                        "gantt_task_id": str(uuid4()),  # does not exist
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 400, resp.text

    def test_push_id_colliding_with_another_users_task_returns_conflict_not_400(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """A client-generated UUID colliding with another user's task id must not abort the batch.

        Previously this raised ValidationError ("task not found"), 400ing the
        *entire* batch — every other record in the same push failed too, and
        the response also implicitly leaked that the id belongs to someone
        else (distinguishable from an ordinary stale-record conflict).
        """
        admin_h = auth_headers(1, is_admin=True)
        owner_id = _create_user(db_client, admin_h, "task-collision-owner")
        prober_id = _create_user(db_client, admin_h, "task-collision-prober")
        owner_headers = auth_headers(owner_id)
        prober_headers = auth_headers(prober_id)

        shared_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": shared_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "text": "Owner's task",
                        "label_id": None,
                        "start_time": "2026-02-01T09:00:00+00:00",
                        "stop_time": "2026-02-01T10:00:00+00:00",
                        "includes_break": False,
                    }
                ]
            },
            headers=owner_headers,
        )

        other_task_id = str(uuid4())
        resp = db_client.post(
            "/api/sync/push",
            json={
                "tasks": [
                    {
                        "id": shared_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "text": "Trying to update someone else's task",
                    },
                    {
                        "id": other_task_id,
                        "action": "create",
                        "client_updated_at": _ts(-5),
                        "text": "Unrelated task in the same batch",
                        "label_id": None,
                        "start_time": "2026-02-01T11:00:00+00:00",
                        "stop_time": "2026-02-01T12:00:00+00:00",
                        "includes_break": False,
                    },
                ]
            },
            headers=prober_headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["results"]["tasks"]
        assert results[0]["status"] == "conflict"
        assert results[1]["status"] == "ok"

        # The owner's task is untouched.
        owner_pull = db_client.get("/api/sync/pull", headers=owner_headers)
        owner_task = next(t for t in owner_pull.json()["tasks"] if t["id"] == shared_id)
        assert owner_task["text"] == "Owner's task"

    def test_push_id_colliding_with_another_users_template_or_gantt_task_returns_conflict(
        self, db_client: TestClient, auth_headers
    ) -> None:
        """Same fix as tasks/labels, for templates and gantt tasks."""
        admin_h = auth_headers(1, is_admin=True)
        owner_id = _create_user(db_client, admin_h, "other-entity-collision-owner")
        prober_id = _create_user(db_client, admin_h, "other-entity-collision-prober")
        owner_headers = auth_headers(owner_id)
        prober_headers = auth_headers(prober_id)

        template_id = str(uuid4())
        gantt_id = str(uuid4())
        db_client.post(
            "/api/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "text": "Owner's template",
                        "label_id": None,
                        "start_time": "09:00:00",
                        "stop_time": "10:00:00",
                    }
                ],
                "gantt_tasks": [
                    {
                        "id": gantt_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": "Owner's gantt task",
                        "start_date": "2026-02-01",
                        "end_date": "2026-02-28",
                        "progress": 0,
                    }
                ],
            },
            headers=owner_headers,
        )

        resp = db_client.post(
            "/api/sync/push",
            json={
                "templates": [
                    {
                        "id": template_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "text": "Prober trying to rename",
                    }
                ],
                "gantt_tasks": [
                    {
                        "id": gantt_id,
                        "action": "update",
                        "client_updated_at": _ts(-5),
                        "name": "Prober trying to rename",
                    }
                ],
            },
            headers=prober_headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["results"]
        assert results["templates"][0]["status"] == "conflict"
        assert results["gantt_tasks"][0]["status"] == "conflict"

    def test_rest_write_triggers_sync_broadcast(self, db_client: TestClient, auth_headers) -> None:
        """CRUD writes must emit a sync_changed hint (previously only /sync/push did)."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "rest-broadcast-user")
        headers = auth_headers(user_id)

        with patch(
            "app.utils.sse_manager.sync_event_manager.broadcast_sync_changed",
            new_callable=AsyncMock,
        ) as mock_bc:
            mock_bc.return_value = 0
            resp = db_client.post(
                f"/api/time-tracking/labels?user_id={user_id}",
                json={"name": "Broadcast Label", "color": "#AABBCC"},
                headers=headers,
            )
            assert resp.status_code == 201
            mock_bc.assert_called_once_with(user_id)


class TestBulkDeleteGuard:
    """A push must not be able to silently erase an account's data.

    The first-sync "keep local data" path turns every server record without a
    local counterpart into a delete, so a client whose local collections have
    not finished loading asks the server to remove everything.  Nothing in the
    payload distinguishes that from a user who genuinely cleared their data, so
    the deliberate case has to opt in with ``allow_bulk_delete``.
    """

    @staticmethod
    def _seed_labels(client: TestClient, headers: dict, count: int) -> list[str]:
        label_ids = [str(uuid4()) for _ in range(count)]
        resp = client.post(
            "/api/sync/push",
            json={
                "labels": [
                    {
                        "id": label_id,
                        "action": "create",
                        "client_updated_at": _ts(-10),
                        "name": f"Label {index}",
                        "color": "#123456",
                    }
                    for index, label_id in enumerate(label_ids)
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        return label_ids

    @staticmethod
    def _delete_payload(label_ids: list[str], **extra) -> dict:  # noqa: ANN003
        return {
            "labels": [{"id": label_id, "action": "delete", "client_updated_at": _ts(5)} for label_id in label_ids],
            **extra,
        }

    def test_refuses_a_push_that_would_wipe_the_account(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-guard-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 30)

        resp = db_client.post("/api/sync/push", json=self._delete_payload(label_ids), headers=headers)
        assert resp.status_code == 409, resp.text

        # Nothing was applied: the guard runs before any record is touched.
        pull = db_client.get("/api/sync/pull", headers=headers)
        assert pull.status_code == 200
        assert all(label["deleted_at"] is None for label in pull.json()["labels"])

    def test_allows_the_same_push_when_the_client_opts_in(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-optin-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 30)

        resp = db_client.post(
            "/api/sync/push",
            json=self._delete_payload(label_ids, allow_bulk_delete=True),
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert all(r["status"] == "ok" for r in resp.json()["results"]["labels"])

        pull = db_client.get("/api/sync/pull", headers=headers)
        assert all(label["deleted_at"] is not None for label in pull.json()["labels"])

    def test_allows_deleting_a_minority_of_records(self, db_client: TestClient, auth_headers) -> None:
        """Ordinary pruning stays well under the guard's threshold."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-minority-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 60)

        resp = db_client.post("/api/sync/push", json=self._delete_payload(label_ids[:30]), headers=headers)
        assert resp.status_code == 200, resp.text

    def test_allows_deleting_everything_in_a_small_account(self, db_client: TestClient, auth_headers) -> None:
        """Below BULK_DELETE_MIN_RECORDS the blast radius is small enough not to gate."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-small-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 5)

        resp = db_client.post("/api/sync/push", json=self._delete_payload(label_ids), headers=headers)
        assert resp.status_code == 200, resp.text

    def test_replayed_deletes_do_not_trip_the_guard(self, db_client: TestClient, auth_headers) -> None:
        """A re-flushed outbox is full of already-applied deletes.

        Counting those would let a client deadlock against its own earlier
        success: the retry would be refused forever even though it is a no-op.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-replay-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 30)

        applied = db_client.post(
            "/api/sync/push",
            json=self._delete_payload(label_ids, allow_bulk_delete=True),
            headers=headers,
        )
        assert applied.status_code == 200, applied.text

        # Same batch again, this time without the opt-in — every delete is now a
        # no-op against an already-tombstoned row, so nothing is at risk.
        replay = db_client.post("/api/sync/push", json=self._delete_payload(label_ids), headers=headers)
        assert replay.status_code == 200, replay.text

    def test_guard_ignores_another_user_s_records(self, db_client: TestClient, auth_headers) -> None:
        """The active-record count is per user, not global."""
        admin_h = auth_headers(1, is_admin=True)
        other_id = _create_user(db_client, admin_h, "bulk-delete-bystander")
        self._seed_labels(db_client, auth_headers(other_id), 100)

        user_id = _create_user(db_client, admin_h, "bulk-delete-scoped-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 30)

        # 30 of this user's 30 records — a wipe, regardless of how much data
        # the unrelated account happens to hold.
        resp = db_client.post("/api/sync/push", json=self._delete_payload(label_ids), headers=headers)
        assert resp.status_code == 409, resp.text

    def test_declared_total_refuses_the_first_chunk_of_a_split_wipe(self, db_client: TestClient, auth_headers) -> None:
        """A chunked destructive push must be refused before its first chunk lands.

        Each chunk is its own transaction, so a per-chunk view of 1500 deletes
        split as 1000 + 500 lets the first through (1000 of 1500 active is under
        the fraction) and only refuses the second — leaving the account
        two-thirds erased. The client declares the logical total so every chunk
        is judged against it.
        """
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-declared-user")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 40)

        # A first chunk that on its own information looks like an ordinary
        # partial delete: 20 of 40 active rows, half the account.
        first_chunk = self._delete_payload(label_ids[:20], declared_delete_total=40)
        resp = db_client.post("/api/sync/push", json=first_chunk, headers=headers)
        assert resp.status_code == 409, resp.text

        # Nothing was applied.
        pull = db_client.get("/api/sync/pull", headers=headers)
        assert all(label["deleted_at"] is None for label in pull.json()["labels"])

    def test_declared_total_is_ignored_when_the_client_opted_in(self, db_client: TestClient, auth_headers) -> None:
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-declared-optin")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 40)

        resp = db_client.post(
            "/api/sync/push",
            json=self._delete_payload(label_ids[:20], declared_delete_total=40, allow_bulk_delete=True),
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    def test_a_modest_declared_total_still_passes(self, db_client: TestClient, auth_headers) -> None:
        """Declaring a total only tightens the guard where it should."""
        admin_h = auth_headers(1, is_admin=True)
        user_id = _create_user(db_client, admin_h, "bulk-delete-declared-modest")
        headers = auth_headers(user_id)
        label_ids = self._seed_labels(db_client, headers, 100)

        resp = db_client.post(
            "/api/sync/push",
            json=self._delete_payload(label_ids[:20], declared_delete_total=40),
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
