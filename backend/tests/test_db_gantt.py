"""Tests for database-backed personal Gantt task endpoints."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_gantt_task_crud_and_validation(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "gantt-owner")
    other_id = create_user_factory(db_client, admin_headers, "gantt-other")

    owner_headers = auth_headers(owner_id)
    other_headers = auth_headers(other_id)

    # Create → 201, correct fields returned
    create_resp = db_client.post(
        f"/v1/db/gantt-tasks?user_id={owner_id}",
        json={
            "name": "Design phase",
            "start_date": "2026-03-01",
            "end_date": "2026-03-15",
            "progress": 10,
            "dependencies": None,
            "notes": "Initial design work",
        },
        headers=owner_headers,
    )
    assert create_resp.status_code == 201
    task_id = create_resp.json()["id"]
    assert create_resp.json()["name"] == "Design phase"
    assert create_resp.json()["start_date"] == "2026-03-01"
    assert create_resp.json()["end_date"] == "2026-03-15"
    assert create_resp.json()["progress"] == 10
    assert create_resp.json()["notes"] == "Initial design work"
    assert create_resp.json()["user_id"] == owner_id

    # List → 200, item appears in list
    list_resp = db_client.get(
        f"/v1/db/gantt-tasks?user_id={owner_id}",
        headers=owner_headers,
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    assert list_resp.json()["items"][0]["id"] == task_id
    assert "X-Db-Query-Ms" in list_resp.headers

    # Get single → 200, correct fields
    get_resp = db_client.get(
        f"/v1/db/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == task_id
    assert get_resp.json()["name"] == "Design phase"

    # Update → 200, fields changed
    update_resp = db_client.put(
        f"/v1/db/gantt-tasks/{task_id}?user_id={owner_id}",
        json={"name": "Design & prototyping", "progress": 50},
        headers=owner_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Design & prototyping"
    assert update_resp.json()["progress"] == 50
    assert update_resp.json()["end_date"] == "2026-03-15"  # unchanged

    # 400 for end_date < start_date on partial update against existing persisted dates
    bad_update_resp = db_client.put(
        f"/v1/db/gantt-tasks/{task_id}?user_id={owner_id}",
        json={"start_date": "2026-03-20"},
        headers=owner_headers,
    )
    assert bad_update_resp.status_code == 400

    # 422 for end_date < start_date when both dates are invalid in the request payload
    bad_update_payload_resp = db_client.put(
        f"/v1/db/gantt-tasks/{task_id}?user_id={owner_id}",
        json={"start_date": "2026-03-20", "end_date": "2026-03-10"},
        headers=owner_headers,
    )
    assert bad_update_payload_resp.status_code == 422

    # Delete → 204, subsequent GET returns 404
    delete_resp = db_client.delete(
        f"/v1/db/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert delete_resp.status_code == 204

    get_after_delete = db_client.get(
        f"/v1/db/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert get_after_delete.status_code == 404

    # Cross-user 403: owner's user_id with other user's token
    create_resp2 = db_client.post(
        f"/v1/db/gantt-tasks?user_id={other_id}",
        json={
            "name": "Other task",
            "start_date": "2026-04-01",
            "end_date": "2026-04-10",
            "progress": 0,
        },
        headers=other_headers,
    )
    assert create_resp2.status_code == 201
    other_task_id = create_resp2.json()["id"]

    impersonate_resp = db_client.get(
        f"/v1/db/gantt-tasks/{other_task_id}?user_id={other_id}",
        headers=owner_headers,  # owner's token, but querying other user's data
    )
    assert impersonate_resp.status_code == 403

    # 404 for non-existent task ID
    nonexistent_resp = db_client.get(
        f"/v1/db/gantt-tasks/nonexistent-id?user_id={owner_id}",
        headers=owner_headers,
    )
    assert nonexistent_resp.status_code == 404

    # 422 for end_date < start_date at request validation time
    bad_dates_resp = db_client.post(
        f"/v1/db/gantt-tasks?user_id={owner_id}",
        json={
            "name": "Invalid task",
            "start_date": "2026-05-15",
            "end_date": "2026-05-01",
            "progress": 0,
        },
        headers=owner_headers,
    )
    assert bad_dates_resp.status_code == 422

    # 422 for progress out of 0–100 range
    bad_progress_resp = db_client.post(
        f"/v1/db/gantt-tasks?user_id={owner_id}",
        json={
            "name": "Over-progress task",
            "start_date": "2026-06-01",
            "end_date": "2026-06-10",
            "progress": 150,
        },
        headers=owner_headers,
    )
    assert bad_progress_resp.status_code == 422
