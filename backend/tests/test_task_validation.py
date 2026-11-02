"""Shared task rules apply to REST writes and individual sync records."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


def owner(db_client, auth_headers, create_user_factory):
    user_id = create_user_factory(db_client, auth_headers(1, is_admin=True), "validation-owner")
    return auth_headers(user_id)


def task(**changes):
    return {"text": "Work", "start_time": "2026-01-05T09:00:00Z", "stop_time": "2026-01-05T10:00:00Z", **changes}


INVALID = [
    ({"text": ""}, "task_text_invalid"),
    ({"text": " \t\n"}, "task_text_invalid"),
    ({"text": "x" * 1001}, "task_text_invalid"),
    ({"stop_time": "2026-01-06T15:00:00Z"}, "task_duration_invalid"),
    ({"stop_time": "2026-01-05T08:00:00Z"}, "task_duration_invalid"),
    ({"start_time": "2026-01-05T09:00:00"}, "task_timezone_required"),
    ({"stop_time": "2026-01-05T10:00:00"}, "task_timezone_required"),
]


@pytest.mark.parametrize(("changes", "code"), INVALID)
def test_rest_validation_create_and_partial_update(
    db_client: TestClient, auth_headers, create_user_factory, changes, code
):
    headers = owner(db_client, auth_headers, create_user_factory)
    url = "/api/time-tracking/tasks"
    response = db_client.post(url, json=task(**changes), headers=headers)
    assert response.status_code == 400
    assert response.json()["code"] == code
    created = db_client.post(url, json=task(), headers=headers)
    assert created.status_code == 201
    task_id = created.json()["id"]
    response = db_client.put(f"{url}/{task_id}", json=changes, headers=headers)
    assert response.status_code == 400
    assert response.json()["code"] == code
    assert db_client.get(f"{url}/{task_id}", headers=headers).json()["text"] == "Work"


def test_overlap_is_scoped_half_open_and_excludes_self(db_client, auth_headers, create_user_factory):
    headers = owner(db_client, auth_headers, create_user_factory)
    url = "/api/time-tracking/tasks"
    first = db_client.post(url, json=task(), headers=headers).json()
    overlap = task(start_time="2026-01-05T10:30:00+01:00", stop_time="2026-01-05T11:30:00+01:00")
    rejected = db_client.post(url, json=overlap, headers=headers)
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "task_overlap"
    assert rejected.json()["detail"]["conflicting_task_id"] == first["id"]
    assert db_client.put(f"{url}/{first['id']}", json={"text": "Edited"}, headers=headers).status_code == 200
    adjacent = db_client.post(
        url, json=task(start_time="2026-01-05T10:00:00Z", stop_time="2026-01-05T11:00:00Z"), headers=headers
    )
    assert adjacent.status_code == 201
    moved = db_client.put(
        f"{url}/{adjacent.json()['id']}", json={"start_time": "2026-01-05T09:30:00Z"}, headers=headers
    )
    assert moved.status_code == 409
    other_id = create_user_factory(db_client, auth_headers(1, is_admin=True), "other-validation-owner")
    assert db_client.post(url, json=task(), headers=auth_headers(other_id)).status_code == 201
    assert db_client.delete(f"{url}/{first['id']}", headers=headers).status_code == 204
    assert db_client.post(url, json=task(), headers=headers).status_code == 201


@pytest.mark.parametrize(("changes", "code"), INVALID)
def test_sync_rejection_preserves_batch(db_client, auth_headers, create_user_factory, changes, code):
    headers = owner(db_client, auth_headers, create_user_factory)
    timestamp = datetime.now(UTC).isoformat()
    bad_id, good_id = str(uuid4()), str(uuid4())
    response = db_client.post(
        "/api/sync/push",
        json={
            "tasks": [
                {"id": bad_id, "action": "create", "client_updated_at": timestamp, **task(**changes)},
                {"id": good_id, "action": "create", "client_updated_at": timestamp, **task()},
            ]
        },
        headers=headers,
    )
    assert response.status_code == 200
    bad, good = response.json()["results"]["tasks"]
    assert (bad["status"], bad["code"]) == ("conflict", code)
    assert good["status"] == "ok"
    rows = db_client.get("/api/sync/pull", headers=headers).json()["tasks"]
    assert [row["id"] for row in rows] == [good_id]


def test_duration_boundary_and_midnight_remain_allowed(db_client, auth_headers, create_user_factory):
    headers = owner(db_client, auth_headers, create_user_factory)
    response = db_client.post(
        "/api/time-tracking/tasks", json=task(text="x" * 1000, stop_time="2026-01-06T09:00:00Z"), headers=headers
    )
    assert response.status_code == 201


def test_sync_overlap_update_and_replay(db_client, auth_headers, create_user_factory):
    headers = owner(db_client, auth_headers, create_user_factory)
    timestamp = datetime.now(UTC).isoformat()
    first_id, second_id = str(uuid4()), str(uuid4())
    payload = {
        "tasks": [
            {"id": first_id, "action": "create", "client_updated_at": timestamp, **task()},
            {
                "id": second_id,
                "action": "create",
                "client_updated_at": timestamp,
                **task(start_time="2026-01-05T10:00:00Z", stop_time="2026-01-05T11:00:00Z"),
            },
        ]
    }
    assert db_client.post("/api/sync/push", json=payload, headers=headers).status_code == 200
    response = db_client.post(
        "/api/sync/push",
        json={
            "tasks": [
                {
                    "id": second_id,
                    "action": "update",
                    "client_updated_at": datetime.now(UTC).isoformat(),
                    "start_time": "2026-01-05T09:30:00Z",
                },
            ]
        },
        headers=headers,
    )
    result = response.json()["results"]["tasks"][0]
    assert result["code"] == "task_overlap"
    assert result["conflicting_task_id"] == first_id
    # An already-stored record replay still follows LWW rather than validating again.
    replay = db_client.post("/api/sync/push", json=payload, headers=headers)
    assert all(row["code"] is None for row in replay.json()["results"]["tasks"])


@pytest.mark.asyncio
async def test_legacy_invalid_rows_still_pull_and_sync_metadata(db_session):
    from app.database.models import TimeTrackingTask
    from app.schemas import SyncPushRequest, UserCreate
    from app.services.db_service import create_user
    from app.services.sync_service import pull_changes, push_changes

    user = await create_user(db_session, UserCreate(username="legacy-validation", display_name="Legacy"))
    row = TimeTrackingTask(
        user_id=user.id,
        text="",
        start_time=datetime(2026, 1, 1, tzinfo=UTC),
        stop_time=datetime(2026, 1, 3, tzinfo=UTC),
    )
    db_session.add(row)
    await db_session.commit()
    pulled = await pull_changes(db_session, user.id, datetime(1970, 1, 1, tzinfo=UTC))
    assert pulled.tasks[0].text == ""
    result = await push_changes(
        db_session,
        user.id,
        SyncPushRequest(
            tasks=[
                {
                    "id": row.id,
                    "action": "update",
                    "client_updated_at": datetime.now(UTC),
                    "includes_break": True,
                }
            ]
        ),
    )
    assert result.results["tasks"][0].status == "ok"


def test_rest_reopening_prioritizes_running_task_conflict(db_client, auth_headers, create_user_factory):
    headers = owner(db_client, auth_headers, create_user_factory)
    url = "/api/time-tracking/tasks"
    completed = db_client.post(url, json=task(), headers=headers).json()
    assert (
        db_client.post(url, json=task(start_time="2026-01-05T11:00:00Z", stop_time=None), headers=headers).status_code
        == 201
    )
    response = db_client.put(f"{url}/{completed['id']}", json={"stop_time": None}, headers=headers)
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"
    assert response.json()["detail"] == "only one running task is allowed per user"


def test_sync_restore_checks_unchanged_interval_and_preserves_batch(db_client, auth_headers, create_user_factory):
    headers = owner(db_client, auth_headers, create_user_factory)
    url = "/api/time-tracking/tasks"
    original_id = db_client.post(url, json=task(), headers=headers).json()["id"]
    assert db_client.delete(f"{url}/{original_id}", headers=headers).status_code == 204
    occupying_id = db_client.post(url, json=task(), headers=headers).json()["id"]
    valid_id = str(uuid4())
    response = db_client.post(
        "/api/sync/push",
        json={
            "tasks": [
                {
                    "id": original_id,
                    "action": "update",
                    "client_updated_at": datetime.now(UTC).isoformat(),
                    "includes_break": True,
                },
                {
                    "id": valid_id,
                    "action": "create",
                    "client_updated_at": datetime.now(UTC).isoformat(),
                    **task(start_time="2026-01-06T09:00:00Z", stop_time="2026-01-06T10:00:00Z"),
                },
            ]
        },
        headers=headers,
    )
    assert response.status_code == 200
    rejected, accepted = response.json()["results"]["tasks"]
    assert rejected["code"] == "task_overlap"
    assert rejected["conflicting_task_id"] == occupying_id
    assert accepted["status"] == "ok"
    rows = {row["id"]: row for row in db_client.get("/api/sync/pull", headers=headers).json()["tasks"]}
    assert rows[original_id]["deleted_at"] is not None
    assert valid_id in rows


@pytest.mark.asyncio
async def test_legacy_rest_updates_validate_only_changed_fields(db_session):
    from app.database.models import TimeTrackingTask
    from app.schemas import TaskUpdate, UserCreate
    from app.services.db_service import TaskValidationError, create_user, update_task

    user = await create_user(db_session, UserCreate(username="legacy-rest", display_name="Legacy"))
    row = TimeTrackingTask(
        user_id=user.id,
        text="",
        start_time=datetime(2026, 1, 1, tzinfo=UTC),
        stop_time=datetime(2026, 1, 3, tzinfo=UTC),
    )
    db_session.add(row)
    await db_session.commit()
    await update_task(db_session, user.id, row.id, TaskUpdate(includes_break=True))
    assert row.includes_break is True
    # Fixing the interval must not revalidate unchanged legacy text.
    await update_task(db_session, user.id, row.id, TaskUpdate(stop_time=datetime(2026, 1, 1, 1, tzinfo=UTC)))
    assert row.text == ""
    with pytest.raises(TaskValidationError) as error:
        await update_task(db_session, user.id, row.id, TaskUpdate(text=" " * 1001))
    assert error.value.code == "task_text_invalid"
    # Conversely, fixing text must not revalidate an unchanged legacy interval.
    row.stop_time = datetime(2026, 1, 3, tzinfo=UTC)
    await db_session.commit()
    await update_task(db_session, user.id, row.id, TaskUpdate(text="Corrected text"))
    assert row.text == "Corrected text"


@pytest.mark.asyncio
async def test_concurrent_sync_batches_with_child_inserts_do_not_deadlock(test_db, monkeypatch):
    import asyncio

    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.schemas import SyncPushRequest, UserCreate
    from app.services import sync_service
    from app.services.db_service import create_user

    if test_db.dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL foreign-key row locks")
    factory = async_sessionmaker(test_db, expire_on_commit=False)
    async with factory() as session:
        user = await create_user(session, UserCreate(username="batch-locking", display_name="Batch"))
        user_id = user.id
    barrier = asyncio.Barrier(2)
    original_lock = sync_service.lock_task_writes

    async def lock_after_child_flush(session, user_id):
        # Both batches hold FK KEY SHARE locks before requesting the writer lock.
        await session.flush()
        await barrier.wait()
        await original_lock(session, user_id)

    monkeypatch.setattr(sync_service, "lock_task_writes", lock_after_child_flush)

    async def push(index):
        label_id, task_id = str(uuid4()), str(uuid4())
        async with factory() as session:
            payload = SyncPushRequest.model_validate(
                {
                    "labels": [
                        {
                            "id": label_id,
                            "action": "create",
                            "name": f"Batch {index}",
                            "color": "#112233",
                            "client_updated_at": datetime.now(UTC),
                        }
                    ],
                    "tasks": [
                        {
                            "id": task_id,
                            "action": "create",
                            "label_id": label_id,
                            "client_updated_at": datetime.now(UTC),
                            **task(
                                start_time=f"2026-01-05T{9 + index:02}:00:00Z",
                                stop_time=f"2026-01-05T{10 + index:02}:00:00Z",
                            ),
                        }
                    ],
                }
            )
            return await sync_service.push_changes(session, user_id, payload)

    results = await asyncio.wait_for(asyncio.gather(push(0), push(1)), timeout=10)
    assert all(result.results["tasks"][0].status == "ok" for result in results)
