"""Tests for database-backed time tracking endpoints."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from fastapi.testclient import TestClient


def test_label_crud_and_delete(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "labels-owner")
    headers = auth_headers(user_id)

    label_response = db_client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Focus", "color": "#112233"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    update_label_response = db_client.put(
        f"/api/time-tracking/labels/{label_id}?user_id={user_id}",
        json={"name": "Deep Focus", "color": "#223344"},
        headers=headers,
    )
    assert update_label_response.status_code == 200

    task_response = db_client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
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

    # Cannot delete a label that is in use
    delete_label_response = db_client.delete(
        f"/api/time-tracking/labels/{label_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_label_response.status_code == 409

    # Remove the label from the task, then deletion succeeds
    db_client.put(
        f"/api/time-tracking/tasks/{task_id}?user_id={user_id}",
        json={"label_id": None},
        headers=headers,
    )
    delete_label_response = db_client.delete(
        f"/api/time-tracking/labels/{label_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_label_response.status_code == 204


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
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Client", "color": "#778899"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    gantt_response = db_client.post(
        f"/api/gantt-tasks?user_id={user_id}",
        json={
            "name": "Tracked project",
            "start_date": "2026-02-01",
            "end_date": "2026-02-28",
        },
        headers=headers,
    )
    assert gantt_response.status_code == 201
    gantt_task_id = gantt_response.json()["id"]

    invalid_gantt_task = db_client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Invalid Gantt task",
            "label_id": label_id,
            "gantt_task_id": "not-a-real-gantt-task",
            "start_time": datetime(2026, 2, 1, 8, 0).isoformat(),
            "stop_time": datetime(2026, 2, 1, 9, 0).isoformat(),
        },
        headers=headers,
    )
    assert invalid_gantt_task.status_code == 404

    invalid_label_task = db_client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
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
        f"/api/time-tracking/tasks?user_id={user_id}",
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
        f"/api/time-tracking/tasks?user_id={user_id}",
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
        f"/api/time-tracking/tasks/{running_task_id}?user_id={user_id}",
        json={"stop_time": datetime(2026, 2, 2, 11, 0).isoformat()},
        headers=headers,
    )
    assert stop_running_response.status_code == 200

    second_task = db_client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Filtered task",
            "label_id": label_id,
            "gantt_task_id": gantt_task_id,
            "start_time": datetime(2026, 2, 3, 12, 0).isoformat(),
            "stop_time": datetime(2026, 2, 3, 13, 0).isoformat(),
            "includes_break": False,
        },
        headers=headers,
    )
    assert second_task.status_code == 201

    other_user_label = db_client.post(
        f"/api/time-tracking/labels?user_id={other_user_id}",
        json={"name": "Other", "color": "#102030"},
        headers=other_headers,
    )
    assert other_user_label.status_code == 201

    other_user_task = db_client.post(
        f"/api/time-tracking/tasks?user_id={other_user_id}",
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
            f"/api/time-tracking/tasks?user_id={user_id}"
            "&start_date=2026-02-03T00:00:00&end_date=2026-02-03T23:59:59"
            f"&label_id={label_id}"
        ),
        headers=headers,
    )
    assert filtered_by_date_and_label.status_code == 200
    items = filtered_by_date_and_label.json()["items"]
    assert len(items) == 1
    assert items[0]["text"] == "Filtered task"
    assert items[0]["gantt_task_id"] == gantt_task_id

    filtered_by_gantt_task = db_client.get(
        f"/api/time-tracking/tasks?user_id={user_id}&gantt_task_id={gantt_task_id}",
        headers=headers,
    )
    assert filtered_by_gantt_task.status_code == 200
    assert filtered_by_gantt_task.json()["total"] == 1
    assert filtered_by_gantt_task.json()["items"][0]["id"] == second_task.json()["id"]


def test_get_single_resources(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "get-single-owner")
    other_user_id = create_user_factory(db_client, admin_headers, "get-single-other")
    headers = auth_headers(user_id)
    other_headers = auth_headers(other_user_id)

    # Create a label
    label_response = db_client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Single Label", "color": "#aabbcc"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    # GET label by id — owner gets 200
    get_label_response = db_client.get(
        f"/api/time-tracking/labels/{label_id}?user_id={user_id}",
        headers=headers,
    )
    assert get_label_response.status_code == 200
    assert get_label_response.json()["id"] == label_id
    assert get_label_response.json()["name"] == "Single Label"

    # GET label by id — user_id/token mismatch (impersonation) gets 403
    get_label_forbidden = db_client.get(
        f"/api/time-tracking/labels/{label_id}?user_id={user_id}",
        headers=other_headers,
    )
    assert get_label_forbidden.status_code == 403

    # GET label by id — other user's own id but label belongs to owner → 404
    get_label_wrong_owner = db_client.get(
        f"/api/time-tracking/labels/{label_id}?user_id={other_user_id}",
        headers=other_headers,
    )
    assert get_label_wrong_owner.status_code == 404

    # GET label by id — missing id gets 404
    get_label_missing = db_client.get(
        f"/api/time-tracking/labels/not-a-real-id?user_id={user_id}",
        headers=headers,
    )
    assert get_label_missing.status_code == 404

    # Create a task
    task_response = db_client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Single task",
            "label_id": label_id,
            "start_time": datetime(2026, 3, 1, 9, 0).isoformat(),
            "stop_time": datetime(2026, 3, 1, 10, 0).isoformat(),
            "includes_break": False,
        },
        headers=headers,
    )
    assert task_response.status_code == 201
    task_id = task_response.json()["id"]

    # GET task by id — owner gets 200
    get_task_response = db_client.get(
        f"/api/time-tracking/tasks/{task_id}?user_id={user_id}",
        headers=headers,
    )
    assert get_task_response.status_code == 200
    assert get_task_response.json()["id"] == task_id
    assert get_task_response.json()["text"] == "Single task"

    # GET task by id — user_id/token mismatch (impersonation) gets 403
    get_task_forbidden = db_client.get(
        f"/api/time-tracking/tasks/{task_id}?user_id={user_id}",
        headers=other_headers,
    )
    assert get_task_forbidden.status_code == 403

    # GET task by id — missing id gets 404
    get_task_missing = db_client.get(
        f"/api/time-tracking/tasks/not-a-real-id?user_id={user_id}",
        headers=headers,
    )
    assert get_task_missing.status_code == 404

    # Create a template
    template_response = db_client.post(
        f"/api/time-tracking/templates?user_id={user_id}",
        json={
            "text": "Single template",
            "label_id": label_id,
            "start_time": "08:00:00",
            "stop_time": "09:00:00",
        },
        headers=headers,
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    # GET template by id — owner gets 200
    get_template_response = db_client.get(
        f"/api/time-tracking/templates/{template_id}?user_id={user_id}",
        headers=headers,
    )
    assert get_template_response.status_code == 200
    assert get_template_response.json()["id"] == template_id
    assert get_template_response.json()["text"] == "Single template"

    # GET template by id — user_id/token mismatch (impersonation) gets 403
    get_template_forbidden = db_client.get(
        f"/api/time-tracking/templates/{template_id}?user_id={user_id}",
        headers=other_headers,
    )
    assert get_template_forbidden.status_code == 403

    # GET template by id — missing id gets 404
    get_template_missing = db_client.get(
        f"/api/time-tracking/templates/not-a-real-id?user_id={user_id}",
        headers=headers,
    )
    assert get_template_missing.status_code == 404


def test_template_crud(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "template-owner")
    headers = auth_headers(user_id)

    label_response = db_client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Template Label", "color": "#445566"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    create_template_response = db_client.post(
        f"/api/time-tracking/templates?user_id={user_id}",
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
        f"/api/time-tracking/templates?user_id={user_id}",
        headers=headers,
    )
    assert list_templates_response.status_code == 200
    assert list_templates_response.json()["total"] == 1

    update_template_response = db_client.put(
        f"/api/time-tracking/templates/{template_id}?user_id={user_id}",
        json={"text": "Updated daily focus"},
        headers=headers,
    )
    assert update_template_response.status_code == 200
    assert update_template_response.json()["text"] == "Updated daily focus"

    delete_template_response = db_client.delete(
        f"/api/time-tracking/templates/{template_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_template_response.status_code == 204

    empty_templates_response = db_client.get(
        f"/api/time-tracking/templates?user_id={user_id}",
        headers=headers,
    )
    assert empty_templates_response.status_code == 200
    assert empty_templates_response.json()["total"] == 0


def test_cross_user_cannot_read_modify_or_delete_time_tracking_resources(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "tt-owner")
    other_id = create_user_factory(db_client, admin_headers, "tt-other")

    owner_headers = auth_headers(owner_id)
    other_headers = auth_headers(other_id)

    label_response = db_client.post(
        f"/api/time-tracking/labels?user_id={owner_id}",
        json={"name": "Owner Label", "color": "#123456"},
        headers=owner_headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    task_response = db_client.post(
        f"/api/time-tracking/tasks?user_id={owner_id}",
        json={
            "text": "Owner task",
            "label_id": label_id,
            "start_time": datetime(2026, 4, 1, 9, 0).isoformat(),
            "stop_time": datetime(2026, 4, 1, 10, 0).isoformat(),
            "includes_break": False,
        },
        headers=owner_headers,
    )
    assert task_response.status_code == 201
    task_id = task_response.json()["id"]

    template_response = db_client.post(
        f"/api/time-tracking/templates?user_id={owner_id}",
        json={
            "text": "Owner template",
            "label_id": label_id,
            "start_time": "09:00:00",
            "stop_time": "10:00:00",
        },
        headers=owner_headers,
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    assert db_client.get(
        f"/api/time-tracking/labels/{label_id}?user_id={owner_id}",
        headers=other_headers,
    ).status_code == 403
    assert db_client.put(
        f"/api/time-tracking/labels/{label_id}?user_id={owner_id}",
        json={"name": "Intrusion", "color": "#654321"},
        headers=other_headers,
    ).status_code == 403
    assert db_client.delete(
        f"/api/time-tracking/labels/{label_id}?user_id={owner_id}",
        headers=other_headers,
    ).status_code == 403

    assert db_client.get(
        f"/api/time-tracking/tasks/{task_id}?user_id={owner_id}",
        headers=other_headers,
    ).status_code == 403
    assert db_client.put(
        f"/api/time-tracking/tasks/{task_id}?user_id={owner_id}",
        json={"text": "Intrusion"},
        headers=other_headers,
    ).status_code == 403
    assert db_client.delete(
        f"/api/time-tracking/tasks/{task_id}?user_id={owner_id}",
        headers=other_headers,
    ).status_code == 403

    assert db_client.get(
        f"/api/time-tracking/templates/{template_id}?user_id={owner_id}",
        headers=other_headers,
    ).status_code == 403
    assert db_client.put(
        f"/api/time-tracking/templates/{template_id}?user_id={owner_id}",
        json={"text": "Intrusion"},
        headers=other_headers,
    ).status_code == 403
    assert db_client.delete(
        f"/api/time-tracking/templates/{template_id}?user_id={owner_id}",
        headers=other_headers,
    ).status_code == 403


def test_user_id_query_param_is_optional_and_derived_from_auth(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """Omitting ?user_id= now works — the authenticated user's own id is used.

    The parameter is kept for backward compatibility (and is still validated
    to match when provided — see the next test), but new callers no longer
    need to pass it.
    """
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "no-param-owner")
    headers = auth_headers(user_id)

    label_response = db_client.post(
        "/api/time-tracking/labels",
        json={"name": "No param", "color": "#445566"},
        headers=headers,
    )
    assert label_response.status_code == 201, label_response.text
    label_id = label_response.json()["id"]

    list_response = db_client.get("/api/time-tracking/labels", headers=headers)
    assert list_response.status_code == 200
    assert any(item["id"] == label_id for item in list_response.json()["items"])

    get_response = db_client.get(f"/api/time-tracking/labels/{label_id}", headers=headers)
    assert get_response.status_code == 200

    delete_response = db_client.delete(f"/api/time-tracking/labels/{label_id}", headers=headers)
    assert delete_response.status_code == 204


def test_user_id_query_param_still_validated_when_provided(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """Passing a foreign user_id (old calling convention) still 403s."""
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "param-owner")
    other_id = create_user_factory(db_client, admin_headers, "param-other")
    other_headers = auth_headers(other_id)

    response = db_client.post(
        f"/api/time-tracking/labels?user_id={owner_id}",
        json={"name": "Should fail", "color": "#665544"},
        headers=other_headers,
    )
    assert response.status_code == 403


def test_list_labels_pagination(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    """?limit=&offset= slice the response while `total` reflects the full count."""
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "pagination-owner")
    headers = auth_headers(user_id)

    created_ids = []
    for i in range(5):
        response = db_client.post(
            "/api/time-tracking/labels",
            json={"name": f"Label {i}", "color": "#010101"},
            headers=headers,
        )
        assert response.status_code == 201
        created_ids.append(response.json()["id"])

    # No pagination params — unpaginated behavior is unchanged.
    full = db_client.get("/api/time-tracking/labels", headers=headers)
    assert full.status_code == 200
    assert full.json()["total"] == 5
    assert len(full.json()["items"]) == 5

    # limit alone.
    first_page = db_client.get("/api/time-tracking/labels?limit=2", headers=headers)
    assert first_page.status_code == 200
    assert first_page.json()["total"] == 5
    assert len(first_page.json()["items"]) == 2

    # limit + offset covers the remainder without overlap or gaps.
    second_page = db_client.get("/api/time-tracking/labels?limit=2&offset=2", headers=headers)
    third_page = db_client.get("/api/time-tracking/labels?limit=2&offset=4", headers=headers)
    assert len(second_page.json()["items"]) == 2
    assert len(third_page.json()["items"]) == 1

    seen_ids = {item["id"] for item in first_page.json()["items"]}
    seen_ids |= {item["id"] for item in second_page.json()["items"]}
    seen_ids |= {item["id"] for item in third_page.json()["items"]}
    assert seen_ids == set(created_ids)

    # Exceeding the server-side cap is rejected rather than silently clamped.
    from app.utils.pagination import MAX_PAGE_LIMIT

    too_large = db_client.get(
        f"/api/time-tracking/labels?limit={MAX_PAGE_LIMIT + 1}", headers=headers
    )
    assert too_large.status_code == 422
