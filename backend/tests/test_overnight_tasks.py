"""Overnight tasks keep one identity through REST, sync, and calendar consumers."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.database.models import TimeTrackingTask
from app.services.ical_service import _format_task_line
from tests.task_helpers import labeled_payload, labeled_sync_payload
from tests.test_task_validation import owner


@pytest.mark.parametrize(
    ("start", "stop"),
    [
        ("2026-03-28T23:00:00+01:00", "2026-03-29T07:00:00+02:00"),
        ("2026-10-24T23:00:00+02:00", "2026-10-25T07:00:00+01:00"),
    ],
)
def test_overnight_roundtrip_and_next_day_overlap(db_client, auth_headers, create_user_factory, start, stop):
    headers = owner(db_client, auth_headers, create_user_factory)
    response = db_client.post(
        "/api/time-tracking/tasks",
        json=labeled_payload(db_client, headers, {"text": "Night", "start_time": start, "stop_time": stop}),
        headers=headers,
    )
    assert response.status_code == 201
    task_id = response.json()["id"]
    pulled = db_client.get("/api/sync/pull", headers=headers).json()["tasks"]
    assert len(pulled) == 1
    assert pulled[0]["id"] == task_id
    assert datetime.fromisoformat(pulled[0]["stop_time"]) == datetime.fromisoformat(stop)
    overlap_start = stop.replace("07:00:00", "06:30:00")
    overlap_stop = stop.replace("07:00:00", "08:00:00")
    rejected = db_client.post(
        "/api/time-tracking/tasks",
        json=labeled_payload(
            db_client, headers, {"text": "Overlap", "start_time": overlap_start, "stop_time": overlap_stop}
        ),
        headers=headers,
    )
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "task_overlap"
    assert rejected.json()["detail"]["conflicting_task_id"] == task_id
    response = db_client.post(
        "/api/sync/push",
        json=labeled_sync_payload(
            db_client,
            headers,
            {
                "tasks": [
                    {
                        "id": str(uuid4()),
                        "action": "create",
                        "client_updated_at": datetime.now(UTC).isoformat(),
                        "text": "Overlap",
                        "start_time": overlap_start,
                        "stop_time": overlap_stop,
                    },
                    {
                        "id": str(uuid4()),
                        "action": "create",
                        "client_updated_at": datetime.now(UTC).isoformat(),
                        "text": "Adjacent",
                        "start_time": stop,
                        "stop_time": overlap_stop,
                    },
                ]
            },
        ),
        headers=headers,
    )
    assert response.status_code == 200
    bad, good = response.json()["results"]["tasks"]
    assert (bad["status"], bad["code"]) == ("conflict", "task_overlap")
    assert good["status"] == "ok"


def test_calendar_line_names_overnight_stop_date():
    task = TimeTrackingTask(
        text="Night",
        start_time=datetime(2026, 1, 4, 22, tzinfo=UTC),
        stop_time=datetime(2026, 1, 5, 6, tzinfo=UTC),
    )
    assert _format_task_line(task, "Work") == "23:00–07:00 (2026-01-05) Night (Work)"
