"""Tests for database REST API endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient
import jwt
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings
from app.database.engine import get_session
from app.main import app


def _build_client() -> tuple[TestClient, Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    session = Session(engine)

    def override_get_session():
        yield session

    app.dependency_overrides[get_session] = override_get_session
    client = TestClient(app)
    return client, session


def _auth_headers(user_id: int, *, is_admin: bool = False) -> dict[str, str]:
    token_payload = {"sub": str(user_id)}
    if is_admin:
        token_payload["is_admin"] = True

    token = jwt.encode(
        token_payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return {"Authorization": f"Bearer {token}"}


def test_db_user_crud_endpoints() -> None:
    client, session = _build_client()
    try:
        user_response = client.post(
            "/v1/db/users/",
            json={"username": "api-user", "display_name": "API User", "settings": {"theme": "dark"}},
        )
        assert user_response.status_code == 201
        user_id = user_response.json()["id"]

        duplicate_response = client.post(
            "/v1/db/users/",
            json={"username": "api-user", "display_name": "API User 2", "settings": {}},
        )
        assert duplicate_response.status_code == 409

        other_user_response = client.post(
            "/v1/db/users/",
            json={"username": "api-user-other", "display_name": "Other", "settings": {}},
        )
        assert other_user_response.status_code == 201
        other_user_id = other_user_response.json()["id"]

        unauthenticated_by_id = client.get(f"/v1/db/users/{user_id}")
        assert unauthenticated_by_id.status_code == 401

        forbidden_by_id = client.get(
            f"/v1/db/users/{other_user_id}",
            headers=_auth_headers(user_id),
        )
        assert forbidden_by_id.status_code == 403

        by_id_response = client.get(f"/v1/db/users/{user_id}", headers=_auth_headers(user_id))
        assert by_id_response.status_code == 200
        assert by_id_response.json()["settings"]["theme"] == "dark"

        by_username_response = client.get(
            "/v1/db/users/by-username/api-user",
            headers=_auth_headers(user_id),
        )
        assert by_username_response.status_code == 200
        assert by_username_response.json()["id"] == user_id

        forbidden_by_username = client.get(
            "/v1/db/users/by-username/api-user-other",
            headers=_auth_headers(user_id),
        )
        assert forbidden_by_username.status_code == 403

        update_response = client.put(
            f"/v1/db/users/{user_id}",
            json={"display_name": "Renamed", "settings": {"theme": "light"}},
            headers=_auth_headers(user_id),
        )
        assert update_response.status_code == 200
        assert update_response.json()["display_name"] == "Renamed"

        forbidden_update = client.put(
            f"/v1/db/users/{other_user_id}",
            json={"display_name": "Hack"},
            headers=_auth_headers(user_id),
        )
        assert forbidden_update.status_code == 403

        forbidden_list = client.get("/v1/db/users/?offset=0&limit=10", headers=_auth_headers(user_id))
        assert forbidden_list.status_code == 403

        admin_list_response = client.get(
            "/v1/db/users/?offset=0&limit=10",
            headers=_auth_headers(user_id, is_admin=True),
        )
        assert admin_list_response.status_code == 200
        assert admin_list_response.json()["total"] == 2
        assert len(admin_list_response.json()["items"]) == 2

        paged_admin_list_response = client.get(
            "/v1/db/users/?offset=1&limit=1",
            headers=_auth_headers(user_id, is_admin=True),
        )
        assert paged_admin_list_response.status_code == 200
        assert paged_admin_list_response.json()["total"] == 2
        assert len(paged_admin_list_response.json()["items"]) == 1

        forbidden_delete = client.delete(
            f"/v1/db/users/{other_user_id}",
            headers=_auth_headers(user_id),
        )
        assert forbidden_delete.status_code == 403

        delete_response = client.delete(f"/v1/db/users/{user_id}", headers=_auth_headers(user_id))
        assert delete_response.status_code == 204

        missing_response = client.get(
            f"/v1/db/users/{user_id}",
            headers=_auth_headers(other_user_id, is_admin=True),
        )
        assert missing_response.status_code == 404
    finally:
        app.dependency_overrides.clear()
        session.close()

def test_db_time_tracking_endpoints_require_auth_and_user_match() -> None:
    client, session = _build_client()
    try:
        owner_id = client.post(
            "/v1/db/users/",
            json={"username": "time-user", "display_name": "Time User", "settings": {}},
        ).json()["id"]
        other_id = client.post(
            "/v1/db/users/",
            json={"username": "other-user", "display_name": "Other User", "settings": {}},
        ).json()["id"]

        unauthenticated = client.get(f"/v1/db/time-tracking/labels?user_id={owner_id}")
        assert unauthenticated.status_code == 401

        forbidden = client.get(
            f"/v1/db/time-tracking/labels?user_id={owner_id}",
            headers=_auth_headers(other_id),
        )
        assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()
        session.close()


def test_db_time_tracking_endpoints() -> None:
    client, session = _build_client()
    try:
        user_id = client.post(
            "/v1/db/users/",
            json={"username": "time-user-2", "display_name": "Time User", "settings": {}},
        ).json()["id"]
        headers = _auth_headers(user_id)

        label_response = client.post(
            f"/v1/db/time-tracking/labels?user_id={user_id}",
            json={"name": "Focus", "color": "#112233"},
            headers=headers,
        )
        assert label_response.status_code == 201
        label_id = label_response.json()["id"]

        labels_list_response = client.get(
            f"/v1/db/time-tracking/labels?user_id={user_id}",
            headers=headers,
        )
        assert labels_list_response.status_code == 200
        assert "X-Db-Query-Ms" in labels_list_response.headers

        task_response = client.post(
            f"/v1/db/time-tracking/tasks?user_id={user_id}",
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
            f"/v1/db/time-tracking/tasks?user_id={user_id}",
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
            f"/v1/db/time-tracking/tasks/running?user_id={user_id}",
            headers=headers,
        )
        assert running_response.status_code == 200
        assert running_response.json()["id"] == task_id
        assert "X-Db-Query-Ms" in running_response.headers

        update_task_response = client.put(
            f"/v1/db/time-tracking/tasks/{task_id}?user_id={user_id}",
            json={"stop_time": datetime(2026, 1, 1, 11, 0).isoformat()},
            headers=headers,
        )
        assert update_task_response.status_code == 200

        template_response = client.post(
            f"/v1/db/time-tracking/templates?user_id={user_id}",
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
            f"/v1/db/time-tracking/tasks?user_id={user_id}",
            headers=headers,
        )
        assert list_tasks_response.status_code == 200
        assert list_tasks_response.json()["total"] == 1
        assert "X-Db-Query-Ms" in list_tasks_response.headers

        delete_template_response = client.delete(
            f"/v1/db/time-tracking/templates/{template_id}?user_id={user_id}",
            headers=headers,
        )
        assert delete_template_response.status_code == 204

        delete_task_response = client.delete(
            f"/v1/db/time-tracking/tasks/{task_id}?user_id={user_id}",
            headers=headers,
        )
        assert delete_task_response.status_code == 204

        delete_label_response = client.delete(
            f"/v1/db/time-tracking/labels/{label_id}?user_id={user_id}",
            headers=headers,
        )
        assert delete_label_response.status_code == 204

        missing_body_response = client.post(
            f"/v1/db/time-tracking/labels?user_id={user_id}",
            headers=headers,
        )
        assert missing_body_response.status_code == 422
    finally:
        app.dependency_overrides.clear()
        session.close()


def test_work_location_endpoints_require_auth_and_user_match() -> None:
    client, session = _build_client()
    try:
        owner_id = client.post(
            "/v1/db/users/",
            json={"username": "loc-owner", "display_name": "Location Owner", "settings": {}},
        ).json()["id"]
        other_id = client.post(
            "/v1/db/users/",
            json={"username": "loc-other", "display_name": "Location Other", "settings": {}},
        ).json()["id"]

        unauthenticated = client.get(f"/v1/db/work-locations/?user_id={owner_id}")
        assert unauthenticated.status_code == 401

        forbidden = client.get(
            f"/v1/db/work-locations/?user_id={owner_id}",
            headers=_auth_headers(other_id),
        )
        assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()
        session.close()


def test_work_location_endpoints() -> None:
    client, session = _build_client()
    try:
        user_id = client.post(
            "/v1/db/users/",
            json={"username": "loc-user", "display_name": "Location User", "settings": {}},
        ).json()["id"]
        headers = _auth_headers(user_id)

        create_response = client.post(
            f"/v1/db/work-locations/?user_id={user_id}",
            json={"date": "2026-01-02", "country_code": "nl", "label": "Home"},
            headers=headers,
        )
        assert create_response.status_code == 201
        assert create_response.json()["country_code"] == "NL"

        update_response = client.post(
            f"/v1/db/work-locations/?user_id={user_id}",
            json={"date": "2026-01-02", "country_code": "BE", "label": "Client"},
            headers=headers,
        )
        assert update_response.status_code == 201
        assert update_response.json()["label"] == "Client"

        list_response = client.get(
            f"/v1/db/work-locations/?user_id={user_id}&start_date=2026-01-01&end_date=2026-01-03",
            headers=headers,
        )
        assert list_response.status_code == 200
        assert list_response.json()["total"] == 1

        by_date_response = client.get(
            f"/v1/db/work-locations/2026-01-02?user_id={user_id}",
            headers=headers,
        )
        assert by_date_response.status_code == 200

        delete_response = client.delete(
            f"/v1/db/work-locations/?user_id={user_id}&date=2026-01-02",
            headers=headers,
        )
        assert delete_response.status_code == 204

        missing_response = client.get(
            f"/v1/db/work-locations/2026-01-02?user_id={user_id}",
            headers=headers,
        )
        assert missing_response.status_code == 404

        invalid_country_response = client.post(
            f"/v1/db/work-locations/?user_id={user_id}",
            json={"date": "2026-01-03", "country_code": "ZZ", "label": None},
            headers=headers,
        )
        assert invalid_country_response.status_code == 422

        missing_body_response = client.post(
            f"/v1/db/work-locations/?user_id={user_id}",
            headers=headers,
        )
        assert missing_body_response.status_code == 422
    finally:
        app.dependency_overrides.clear()
        session.close()
