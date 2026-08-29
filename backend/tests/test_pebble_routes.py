"""Authorization and behavior tests for the dedicated Pebble API."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient


def test_pebble_scope_matrix_and_clock_actions(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "pebble-actions-user")
    read_headers = auth_headers(user_id, via_pat=True)
    write_headers = auth_headers(user_id, via_pat=True, pat_write=True)

    dashboard = db_client.get("/api/pebble/dashboard", headers=read_headers)
    denied_clock_in = db_client.post("/api/pebble/actions/clock-in", headers=read_headers)

    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["running_task"] is None
    assert denied_clock_in.status_code == 403

    clocked_in = db_client.post("/api/pebble/actions/clock-in", headers=write_headers)
    assert clocked_in.status_code == 201, clocked_in.text
    running_task_id = clocked_in.json()["id"]
    assert clocked_in.json()["stop_time"] is None

    duplicate_clock_in = db_client.post(
        "/api/pebble/actions/clock-in",
        headers=write_headers,
    )
    assert duplicate_clock_in.status_code == 409

    refreshed = db_client.get("/api/pebble/dashboard", headers=write_headers)
    assert refreshed.status_code == 200
    assert refreshed.json()["running_task"]["id"] == running_task_id

    regular_api = db_client.get(
        "/api/time-tracking/tasks/running",
        headers=write_headers,
    )
    assert regular_api.status_code == 403

    clocked_out = db_client.post("/api/pebble/actions/clock-out", headers=write_headers)
    assert clocked_out.status_code == 200, clocked_out.text
    assert clocked_out.json()["id"] == running_task_id
    assert clocked_out.json()["stop_time"] is not None

    duplicate_clock_out = db_client.post(
        "/api/pebble/actions/clock-out",
        headers=write_headers,
    )
    assert duplicate_clock_out.status_code == 409


def test_pebble_dashboard_reports_soonest_planned_task(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "pebble-planned-user")
    owner_headers = auth_headers(user_id)
    read_headers = auth_headers(user_id, via_pat=True)

    empty_dashboard = db_client.get("/api/pebble/dashboard", headers=read_headers)
    assert empty_dashboard.status_code == 200, empty_dashboard.text
    assert empty_dashboard.json()["planned_task"] is None

    now = datetime.now(UTC)

    def _create_task(text: str, start_time: datetime, stop_time: datetime | None) -> str:
        payload = {
            "text": text,
            "start_time": start_time.isoformat(),
            "stop_time": stop_time.isoformat() if stop_time else None,
        }
        response = db_client.post("/api/time-tracking/tasks", json=payload, headers=owner_headers)
        assert response.status_code == 201, response.text
        return response.json()["id"]

    # A past task and a currently-running task are not "planned" -- neither
    # should be reported as the soonest upcoming one.
    _create_task("Past", now - timedelta(hours=2), now - timedelta(hours=1))
    _create_task("Running", now - timedelta(minutes=10), None)
    later_id = _create_task("Later", now + timedelta(hours=2), now + timedelta(hours=3))
    soonest_id = _create_task("Soonest", now + timedelta(minutes=30), now + timedelta(hours=1))

    dashboard = db_client.get("/api/pebble/dashboard", headers=read_headers)
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    assert body["planned_task"]["id"] == soonest_id
    assert body["planned_task"]["id"] != later_id
    assert body["running_task"]["text"] == "Running"


def test_pebble_clock_actions_write_delegated_audit_entries(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "pebble-audit-user")
    write_headers = auth_headers(user_id, via_pat=True, pat_write=True)
    owner_headers = auth_headers(user_id)

    clocked_in = db_client.post("/api/pebble/actions/clock-in", headers=write_headers)
    assert clocked_in.status_code == 201, clocked_in.text
    task_id = clocked_in.json()["id"]

    clocked_out = db_client.post("/api/pebble/actions/clock-out", headers=write_headers)
    assert clocked_out.status_code == 200, clocked_out.text

    trail = db_client.get("/api/audit", headers=owner_headers)
    assert trail.status_code == 200, trail.text
    entries = trail.json()["items"]
    matching = [e for e in entries if e["resource_id"] == task_id]
    assert {e["action"] for e in matching} == {"create_task", "update_task"}
    assert all(e["auth_source"] == "delegated" for e in matching)


def test_keycloak_user_keeps_access_to_pebble_surface(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "pebble-keycloak-user")
    keycloak_headers = auth_headers(user_id)

    dashboard = db_client.get("/api/pebble/dashboard", headers=keycloak_headers)
    clocked_in = db_client.post(
        "/api/pebble/actions/clock-in",
        headers=keycloak_headers,
    )
    clocked_out = db_client.post(
        "/api/pebble/actions/clock-out",
        headers=keycloak_headers,
    )

    assert dashboard.status_code == 200
    assert clocked_in.status_code == 201
    assert clocked_out.status_code == 200
