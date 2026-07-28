"""Authorization and behavior tests for the dedicated Pebble API."""

from __future__ import annotations

from collections.abc import Callable

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
