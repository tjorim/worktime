"""Tests for database REST API endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime, time

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    GanttTask,
    TimeOffEntry,
    TimeTrackingLabel,
    TimeTrackingTask,
    TimeTrackingTemplate,
    UserPreferences,
    WorkLocation,
)


def _auth_headers(user_id: int, *, is_admin: bool = False) -> dict[str, str]:
    role = "admin" if is_admin else "user"
    token = f"test.{user_id}.{role}"
    return {"Authorization": f"Bearer {token}"}


def test_db_user_crud_endpoints(
    db_client: TestClient,
) -> None:
    client = db_client
    admin_headers = _auth_headers(1, is_admin=True)

    unauthenticated_create = client.post(
        "/api/users/",
        json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}},
    )
    assert unauthenticated_create.status_code == 401

    forbidden_create = client.post(
        "/api/users/",
        json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}},
        headers=_auth_headers(2),
    )
    assert forbidden_create.status_code == 403

    user_response = client.post(
        "/api/users/",
        json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}},
        headers=admin_headers,
    )
    assert user_response.status_code == 201
    user_id = user_response.json()["id"]

    duplicate_response = client.post(
        "/api/users/",
        json={"username": "api-user", "display_name": "API User 2", "settings": {}},
        headers=admin_headers,
    )
    assert duplicate_response.status_code == 409

    other_user_response = client.post(
        "/api/users/",
        json={"username": "api-user-other", "display_name": "Other", "settings": {}},
        headers=admin_headers,
    )
    assert other_user_response.status_code == 201
    other_user_id = other_user_response.json()["id"]

    unauthenticated_by_id = client.get(f"/api/users/{user_id}")
    assert unauthenticated_by_id.status_code == 401

    forbidden_by_id = client.get(
        f"/api/users/{other_user_id}",
        headers=_auth_headers(user_id),
    )
    assert forbidden_by_id.status_code == 403

    by_id_response = client.get(f"/api/users/{user_id}", headers=_auth_headers(user_id))
    assert by_id_response.status_code == 200
    assert by_id_response.json()["settings"]["theme"] == "dark"

    by_username_response = client.get(
        "/api/users/by-username/api-user",
        headers=_auth_headers(user_id),
    )
    assert by_username_response.status_code == 200
    assert by_username_response.json()["id"] == user_id

    forbidden_by_username = client.get(
        "/api/users/by-username/api-user-other",
        headers=_auth_headers(user_id),
    )
    assert forbidden_by_username.status_code == 403

    update_response = client.put(
        f"/api/users/{user_id}",
        json={"username": "api-user-renamed", "display_name": "Renamed", "settings": {"theme": "light"}},
        headers=_auth_headers(user_id),
    )
    assert update_response.status_code == 200
    assert update_response.json()["username"] == "api-user-renamed"
    assert update_response.json()["display_name"] == "Renamed"

    forbidden_update = client.put(
        f"/api/users/{other_user_id}",
        json={"display_name": "Hack"},
        headers=_auth_headers(user_id),
    )
    assert forbidden_update.status_code == 403

    duplicate_username_update = client.put(
        f"/api/users/{user_id}",
        json={"username": "api-user-other"},
        headers=_auth_headers(user_id),
    )
    assert duplicate_username_update.status_code == 409

    forbidden_list = client.get("/api/users/?offset=0&limit=10", headers=_auth_headers(user_id))
    assert forbidden_list.status_code == 403

    admin_list_response = client.get(
        "/api/users/?offset=0&limit=10",
        headers=_auth_headers(user_id, is_admin=True),
    )
    assert admin_list_response.status_code == 200
    assert admin_list_response.json()["total"] == 2
    assert len(admin_list_response.json()["items"]) == 2

    max_limit_list_response = client.get(
        "/api/users/?offset=0&limit=1000",
        headers=_auth_headers(user_id, is_admin=True),
    )
    assert max_limit_list_response.status_code == 200

    above_max_limit_list_response = client.get(
        "/api/users/?offset=0&limit=1001",
        headers=_auth_headers(user_id, is_admin=True),
    )
    assert above_max_limit_list_response.status_code == 422

    forbidden_delete = client.delete(
        f"/api/users/{other_user_id}",
        headers=_auth_headers(user_id),
    )
    assert forbidden_delete.status_code == 403

    delete_response = client.delete(f"/api/users/{user_id}", headers=_auth_headers(user_id))
    assert delete_response.status_code == 204

    missing_response = client.get(
        f"/api/users/{user_id}",
        headers=_auth_headers(other_user_id, is_admin=True),
    )
    assert missing_response.status_code == 404


def test_db_time_tracking_endpoints_require_auth_and_user_match(db_client: TestClient) -> None:
    client = db_client
    admin_headers = _auth_headers(1, is_admin=True)

    owner_id = client.post(
        "/api/users/",
        json={"username": "time-user", "display_name": "Time User", "settings": {}},
        headers=admin_headers,
    ).json()["id"]
    other_id = client.post(
        "/api/users/",
        json={"username": "other-user", "display_name": "Other User", "settings": {}},
        headers=admin_headers,
    ).json()["id"]

    unauthenticated = client.get(f"/api/time-tracking/labels?user_id={owner_id}")
    assert unauthenticated.status_code == 401

    forbidden = client.get(
        f"/api/time-tracking/labels?user_id={owner_id}",
        headers=_auth_headers(other_id),
    )
    assert forbidden.status_code == 403


def test_db_time_tracking_endpoints(db_client: TestClient) -> None:
    client = db_client
    admin_headers = _auth_headers(1, is_admin=True)

    user_id = client.post(
        "/api/users/",
        json={"username": "time-user-2", "display_name": "Time User", "settings": {}},
        headers=admin_headers,
    ).json()["id"]
    headers = _auth_headers(user_id)

    label_response = client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        json={"name": "Focus", "color": "#112233"},
        headers=headers,
    )
    assert label_response.status_code == 201
    label_id = label_response.json()["id"]

    labels_list_response = client.get(
        f"/api/time-tracking/labels?user_id={user_id}",
        headers=headers,
    )
    assert labels_list_response.status_code == 200
    assert "X-Db-Query-Ms" in labels_list_response.headers

    running_empty_response = client.get(
        f"/api/time-tracking/tasks/running?user_id={user_id}",
        headers=headers,
    )
    assert running_empty_response.status_code == 204
    assert "X-Db-Query-Ms" in running_empty_response.headers

    task_response = client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Implement endpoint",
            "label_id": label_id,
            "start_time": datetime(2026, 1, 1, 9, 0).isoformat(),
            "stop_time": None,
            "includes_break": False,
        },
        headers=headers,
    )
    assert task_response.status_code == 201
    task_id = task_response.json()["id"]

    second_running_task_response = client.post(
        f"/api/time-tracking/tasks?user_id={user_id}",
        json={
            "text": "Second running task",
            "label_id": label_id,
            "start_time": datetime(2026, 1, 1, 10, 0).isoformat(),
            "stop_time": None,
            "includes_break": False,
        },
        headers=headers,
    )
    assert second_running_task_response.status_code == 409

    running_response = client.get(
        f"/api/time-tracking/tasks/running?user_id={user_id}",
        headers=headers,
    )
    assert running_response.status_code == 200
    assert running_response.json()["id"] == task_id
    assert "X-Db-Query-Ms" in running_response.headers

    update_task_response = client.put(
        f"/api/time-tracking/tasks/{task_id}?user_id={user_id}",
        json={"stop_time": datetime(2026, 1, 1, 11, 0).isoformat()},
        headers=headers,
    )
    assert update_task_response.status_code == 200

    template_response = client.post(
        f"/api/time-tracking/templates?user_id={user_id}",
        json={
            "text": "Morning block",
            "label_id": label_id,
            "start_time": "09:00:00",
            "stop_time": "11:00:00",
        },
        headers=headers,
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    list_tasks_response = client.get(
        f"/api/time-tracking/tasks?user_id={user_id}",
        headers=headers,
    )
    assert list_tasks_response.status_code == 200
    assert list_tasks_response.json()["total"] == 1
    assert "X-Db-Query-Ms" in list_tasks_response.headers

    delete_template_response = client.delete(
        f"/api/time-tracking/templates/{template_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_template_response.status_code == 204

    delete_task_response = client.delete(
        f"/api/time-tracking/tasks/{task_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_task_response.status_code == 204

    delete_label_response = client.delete(
        f"/api/time-tracking/labels/{label_id}?user_id={user_id}",
        headers=headers,
    )
    assert delete_label_response.status_code == 204

    missing_body_response = client.post(
        f"/api/time-tracking/labels?user_id={user_id}",
        headers=headers,
    )
    assert missing_body_response.status_code == 422


async def test_db_user_export_endpoint(
    db_client: TestClient,
    db_session: AsyncSession,
) -> None:
    client = db_client
    admin_headers = _auth_headers(1, is_admin=True)

    owner_id = client.post(
        "/api/users/",
        json={"username": "export-owner", "display_name": "Export Owner", "settings": {"theme": "hidden"}},
        headers=admin_headers,
    ).json()["id"]
    other_id = client.post(
        "/api/users/",
        json={"username": "export-other", "display_name": "Export Other", "settings": {}},
        headers=admin_headers,
    ).json()["id"]

    timestamp = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
    label = TimeTrackingLabel(
        id="label-export",
        user_id=owner_id,
        name="Focus",
        color="#112233",
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
    )
    task = TimeTrackingTask(
        id="task-export",
        user_id=owner_id,
        label_id=label.id,
        text="Deleted task",
        start_time=timestamp,
        stop_time=None,
        includes_break=False,
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
        deleted_at=timestamp,
    )
    template = TimeTrackingTemplate(
        id="template-export",
        user_id=owner_id,
        label_id=label.id,
        text="Morning block",
        start_time=time(9, 0),
        stop_time=time(11, 0),
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
    )
    work_location = WorkLocation(
        user_id=owner_id,
        date=date(2026, 1, 2),
        country_code="NL",
        label="Home",
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
        deleted_at=timestamp,
    )
    gantt_task = GanttTask(
        id="gantt-export",
        user_id=owner_id,
        name="Roadmap",
        start_date=date(2026, 1, 3),
        end_date=date(2026, 1, 10),
        progress=50,
        dependencies=None,
        notes="Quarter plan",
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
    )
    time_off_entry = TimeOffEntry(
        user_id=owner_id,
        entry_id="timeoff-export",
        entry_kind="date",
        date=date(2026, 1, 4),
        start_date=None,
        end_date=None,
        weekday=None,
        entry_type="vacation",
        entry_flag="full_day",
        note="Day off",
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
        deleted_at=timestamp,
    )
    preferences = UserPreferences(
        user_id=owner_id,
        data={"theme": "dark", "notifications": "off"},
        client_updated_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db_session.add_all([label, task, template, work_location, gantt_task, time_off_entry, preferences])
    await db_session.commit()

    forbidden = client.get(f"/api/users/{owner_id}/export", headers=_auth_headers(other_id))
    assert forbidden.status_code == 403

    owner_export = client.get(f"/api/users/{owner_id}/export", headers=_auth_headers(owner_id))
    assert owner_export.status_code == 200
    assert owner_export.headers["Content-Disposition"] == 'attachment; filename="worktime-export.json"'
    body = owner_export.json()
    assert "exported_at" in body
    assert body["user"] == {
        "id": owner_id,
        "username": "export-owner",
        "display_name": "Export Owner",
    }
    assert "settings" not in body["user"]
    assert "oidc_subject" not in body["user"]
    assert body["preferences"] == {"theme": "dark", "notifications": "off"}
    assert body["time_tracking_labels"][0]["id"] == "label-export"
    assert body["time_tracking_tasks"][0]["deleted_at"] is not None
    assert body["time_tracking_templates"][0]["id"] == "template-export"
    assert body["work_locations"][0]["deleted_at"] is not None
    assert body["gantt_tasks"][0]["id"] == "gantt-export"
    assert body["time_off_entries"][0]["deleted_at"] is not None

    admin_export = client.get(f"/api/users/{owner_id}/export", headers=_auth_headers(other_id, is_admin=True))
    assert admin_export.status_code == 200


def test_work_location_endpoints_require_auth_and_user_match(db_client: TestClient) -> None:
    client = db_client
    admin_headers = _auth_headers(1, is_admin=True)

    owner_id = client.post(
        "/api/users/",
        json={"username": "loc-owner", "display_name": "Location Owner", "settings": {}},
        headers=admin_headers,
    ).json()["id"]
    other_id = client.post(
        "/api/users/",
        json={"username": "loc-other", "display_name": "Location Other", "settings": {}},
        headers=admin_headers,
    ).json()["id"]

    unauthenticated = client.get(f"/api/work-locations/?user_id={owner_id}")
    assert unauthenticated.status_code == 401

    forbidden = client.get(
        f"/api/work-locations/?user_id={owner_id}",
        headers=_auth_headers(other_id),
    )
    assert forbidden.status_code == 403


def test_work_location_endpoints(db_client: TestClient) -> None:
    client = db_client
    admin_headers = _auth_headers(1, is_admin=True)

    user_id = client.post(
        "/api/users/",
        json={"username": "loc-user", "display_name": "Location User", "settings": {}},
        headers=admin_headers,
    ).json()["id"]
    headers = _auth_headers(user_id)

    create_response = client.post(
        f"/api/work-locations/?user_id={user_id}",
        json={"date": "2026-01-02", "country_code": "nl", "label": "Home"},
        headers=headers,
    )
    assert create_response.status_code == 201
    assert create_response.json()["country_code"] == "NL"

    update_response = client.post(
        f"/api/work-locations/?user_id={user_id}",
        json={"date": "2026-01-02", "country_code": "BE", "label": "Client"},
        headers=headers,
    )
    assert update_response.status_code == 201
    assert update_response.json()["label"] == "Client"

    list_response = client.get(
        f"/api/work-locations/?user_id={user_id}&start_date=2026-01-01&end_date=2026-01-03",
        headers=headers,
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert "X-Db-Query-Ms" in list_response.headers

    by_date_response = client.get(
        f"/api/work-locations/2026-01-02?user_id={user_id}",
        headers=headers,
    )
    assert by_date_response.status_code == 200
    assert "X-Db-Query-Ms" in by_date_response.headers

    delete_response = client.delete(
        f"/api/work-locations/2026-01-02?user_id={user_id}",
        headers=headers,
    )
    assert delete_response.status_code == 204

    missing_response = client.get(
        f"/api/work-locations/2026-01-02?user_id={user_id}",
        headers=headers,
    )
    assert missing_response.status_code == 404

    invalid_country_response = client.post(
        f"/api/work-locations/?user_id={user_id}",
        json={"date": "2026-01-03", "country_code": "ZZ", "label": None},
        headers=headers,
    )
    assert invalid_country_response.status_code == 422

    missing_body_response = client.post(
        f"/api/work-locations/?user_id={user_id}",
        headers=headers,
    )
    assert missing_body_response.status_code == 422
