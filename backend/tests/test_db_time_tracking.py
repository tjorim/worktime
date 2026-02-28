"""Tests for database-backed time tracking endpoints."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from fastapi.testclient import TestClient



def test_label_crud_and_cascade_delete(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "labels-owner")
    headers = auth_headers(user_id)

    label_response = db_client.post(
        f"/v1/db/time-tracking/labels?user_id={user_id}",
        json={"name": "Focus", "color": "#112233"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    update_label_response = db_client.put(
        f"/v1/db/time-tracking/labels/{label_id}?user_id={user_id}",
        json={"name": "Deep Focus", "color": "#223344"},
        headers=headers,
    )
    assert update_label_response.status_code == 200

    task_response = db_client.post(
        f"/v1/db/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Labeled task",
            "label_id": label_id,
            "start_time": datetime(2026, 2, 1, 9, 0).isoformat(),
            "stop_time": datetime(2026, 2, 1, 10, 0).isoformat(),
            "includes_break": False,
        },
        headers=headers,
    )
    assert task_response.status_code == 201
    task_id = task_response.json()["id"]

    delete_label_response = db_client.delete(
        f"/v1/db/time-tracking/labels/{label_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_label_response.status_code == 204

    list_tasks_response = db_client.get(f"/v1/db/time-tracking/tasks?user_id={user_id}", headers=headers)
    assert list_tasks_response.status_code == 200
    assert list_tasks_response.json()["items"][0]["id"] == task_id
    assert list_tasks_response.json()["items"][0]["label_id"] is None


def test_task_constraints_and_filtering(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "task-owner")
    other_user_id = create_user_factory(db_client, admin_headers, "task-other")

    headers = auth_headers(user_id)
    other_headers = auth_headers(other_user_id)

    label_response = db_client.post(
        f"/v1/db/time-tracking/labels?user_id={user_id}",
        json={"name": "Client", "color": "#778899"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    invalid_label_task = db_client.post(
        f"/v1/db/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Invalid label",
            "label_id": "not-a-real-label",
            "start_time": datetime(2026, 2, 1, 8, 0).isoformat(),
            "stop_time": datetime(2026, 2, 1, 9, 0).isoformat(),
            "includes_break": False,
        },
        headers=headers,
    )
    assert invalid_label_task.status_code == 404

    running_task = db_client.post(
        f"/v1/db/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Running task",
            "label_id": label_id,
            "start_time": datetime(2026, 2, 2, 9, 0).isoformat(),
            "stop_time": None,
            "includes_break": False,
        },
        headers=headers,
    )
    assert running_task.status_code == 201
    running_task_id = running_task.json()["id"]

    second_running_task = db_client.post(
        f"/v1/db/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Second running",
            "label_id": label_id,
            "start_time": datetime(2026, 2, 2, 10, 0).isoformat(),
            "stop_time": None,
            "includes_break": False,
        },
        headers=headers,
    )
    assert second_running_task.status_code == 409

    stop_running_response = db_client.put(
        f"/v1/db/time-tracking/tasks/{running_task_id}?user_id={user_id}",
        json={"stop_time": datetime(2026, 2, 2, 11, 0).isoformat()},
        headers=headers,
    )
    assert stop_running_response.status_code == 200

    second_task = db_client.post(
        f"/v1/db/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Filtered task",
            "label_id": label_id,
            "start_time": datetime(2026, 2, 3, 12, 0).isoformat(),
            "stop_time": datetime(2026, 2, 3, 13, 0).isoformat(),
            "includes_break": False,
        },
        headers=headers,
    )
    assert second_task.status_code == 201

    other_user_label = db_client.post(
        f"/v1/db/time-tracking/labels?user_id={other_user_id}",
        json={"name": "Other", "color": "#102030"},
        headers=other_headers,
    )
    assert other_user_label.status_code == 201

    other_user_task = db_client.post(
        f"/v1/db/time-tracking/tasks?user_id={other_user_id}",
        json={
            "text": "Other user task",
            "label_id": other_user_label.json()["id"],
            "start_time": datetime(2026, 2, 3, 14, 0).isoformat(),
            "stop_time": datetime(2026, 2, 3, 15, 0).isoformat(),
            "includes_break": False,
        },
        headers=other_headers,
    )
    assert other_user_task.status_code == 201

    filtered_by_date_and_label = db_client.get(
        (
            f"/v1/db/time-tracking/tasks?user_id={user_id}"
            "&start_date=2026-02-03T00:00:00&end_date=2026-02-03T23:59:59"
            f"&label_id={label_id}"
        ),
        headers=headers,
    )
    assert filtered_by_date_and_label.status_code == 200
    items = filtered_by_date_and_label.json()["items"]
    assert len(items) == 1
    assert items[0]["text"] == "Filtered task"


def test_template_crud(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "template-owner")
    headers = auth_headers(user_id)

    label_response = db_client.post(
        f"/v1/db/time-tracking/labels?user_id={user_id}",
        json={"name": "Template Label", "color": "#445566"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    create_template_response = db_client.post(
        f"/v1/db/time-tracking/templates?user_id={user_id}",
        json={
            "text": "Daily focus",
            "label_id": label_id,
            "start_time": "09:00:00",
            "stop_time": "11:00:00",
        },
        headers=headers,
    )
    assert create_template_response.status_code == 201
    template_id = create_template_response.json()["id"]

    list_templates_response = db_client.get(
        f"/v1/db/time-tracking/templates?user_id={user_id}",
        headers=headers,
    )
    assert list_templates_response.status_code == 200
    assert list_templates_response.json()["total"] == 1

    update_template_response = db_client.put(
        f"/v1/db/time-tracking/templates/{template_id}?user_id={user_id}",
        json={"text": "Updated daily focus"},
        headers=headers,
    )
    assert update_template_response.status_code == 200
    assert update_template_response.json()["text"] == "Updated daily focus"

    delete_template_response = db_client.delete(
        f"/v1/db/time-tracking/templates/{template_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_template_response.status_code == 204

    empty_templates_response = db_client.get(
        f"/v1/db/time-tracking/templates?user_id={user_id}",
        headers=headers,
    )
    assert empty_templates_response.status_code == 200
    assert empty_templates_response.json()["total"] == 0
