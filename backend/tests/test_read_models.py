"""Tests for authenticated reusable read-model endpoints."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.conftest import utc_timestamp_offset as _ts


def _seed_work_context(
    db_client: TestClient,
    headers: dict[str, str],
    *,
    schedule_type: str | None,
    team_number: int | None,
    enable_time_off: bool = True,
) -> None:
    payload: dict[str, object] = {
        "settings": {
            "enableTimeOff": enable_time_off,
        }
    }
    if schedule_type is not None:
        payload["scheduleType"] = schedule_type
    if team_number is not None:
        payload["myTeam"] = team_number

    response = db_client.put(
        "/api/preferences",
        json={"data": payload, "client_updated_at": _ts()},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def test_dashboard_requires_auth(db_client: TestClient) -> None:
    response = db_client.get("/api/read-models/dashboard")
    assert response.status_code == 401


def test_dashboard_returns_reusable_read_models(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "read-model-user")
    headers = auth_headers(user_id)

    _seed_work_context(db_client, headers, schedule_type="5-shift", team_number=1)

    first_time_off = db_client.post(
        "/api/time-off",
        json={
            "entry_id": "summer-trip",
            "entry_kind": "date",
            "date": "2025-07-20",
            "entry_type": "vacation",
            "entry_flag": "full_day",
            "note": "Summer trip",
        },
        headers=headers,
    )
    assert first_time_off.status_code == 201, first_time_off.text

    second_time_off = db_client.post(
        "/api/time-off",
        json={
            "entry_id": "training-week",
            "entry_kind": "range",
            "start_date": "2025-07-25",
            "end_date": "2025-07-28",
            "entry_type": "course",
            "entry_flag": "full_day",
            "note": "Training week",
        },
        headers=headers,
    )
    assert second_time_off.status_code == 201, second_time_off.text

    response = db_client.get(
        "/api/read-models/dashboard?as_of=2025-07-17T08:30:00Z",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()

    assert body["identity"] == {
        "id": user_id,
        "username": "read-model-user",
        "display_name": "Read-Model-User",
        "is_admin": False,
    }
    assert body["work_context"] == {
        "schedule_type": "5-shift",
        "team_number": 1,
        "effective_team_number": 1,
        "state": "ready",
        "feature_flags": {"time_off_enabled": True},
    }
    assert body["current_status"]["current_shift"]["team_number"] == 1
    assert body["current_status"]["current_shift"]["shift"]["code"] == "M"
    assert body["current_status"]["currently_working_team"]["team_number"] == 1
    assert body["current_status"]["currently_working_team"]["is_currently_working"] is True
    assert body["next_shifts"]["items"][0]["date"] == "2025-07-18"
    assert body["next_shifts"]["items"][0]["shift"]["code"] == "L"
    assert len(body["team_status"]["items"]) == 5
    assert body["team_status"]["items"][0]["is_currently_working"] is True
    assert body["time_off_summary"]["active_items"] == []
    assert body["time_off_summary"]["total_upcoming"] == 2
    assert [item["entry_id"] for item in body["time_off_summary"]["upcoming_items"]] == [
        "summer-trip",
        "training-week",
    ]


def test_dashboard_handles_missing_work_context(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "read-model-empty")
    headers = auth_headers(user_id)

    _seed_work_context(db_client, headers, schedule_type=None, team_number=None)

    response = db_client.get(
        "/api/read-models/dashboard?as_of=2025-07-17T08:30:00Z",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["work_context"]["state"] == "missing_work_context"
    assert body["current_status"]["current_shift"] is None
    assert body["next_shifts"]["items"] == []
    assert body["team_status"]["items"] == []


def test_delegated_pebble_token_is_limited_to_dedicated_dashboard(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "pebble-scope-user")
    pebble_headers = auth_headers(user_id, via_pat=True)

    pebble_dashboard = db_client.get("/api/pebble/dashboard", headers=pebble_headers)
    full_dashboard = db_client.get("/api/read-models/dashboard", headers=pebble_headers)
    regular_api = db_client.get("/api/read-models/current-status", headers=pebble_headers)

    assert pebble_dashboard.status_code == 200
    assert full_dashboard.status_code == 403
    assert regular_api.status_code == 403


def test_next_shifts_endpoint_respects_limit(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "read-model-limit")
    headers = auth_headers(user_id)

    _seed_work_context(db_client, headers, schedule_type="5-shift", team_number=1)

    response = db_client.get(
        "/api/read-models/next-shifts?as_of=2025-07-17T08:30:00Z&limit=2",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["date"] for item in body["items"]] == ["2025-07-18", "2025-07-19"]
