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
        f"/api/gantt-tasks?user_id={owner_id}",
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
        f"/api/gantt-tasks?user_id={owner_id}",
        headers=owner_headers,
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    assert list_resp.json()["items"][0]["id"] == task_id
    assert "X-Db-Query-Ms" in list_resp.headers

    # Get single → 200, correct fields
    get_resp = db_client.get(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == task_id
    assert get_resp.json()["name"] == "Design phase"

    # Update → 200, fields changed
    update_resp = db_client.put(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        json={"name": "Design & prototyping", "progress": 50},
        headers=owner_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Design & prototyping"
    assert update_resp.json()["progress"] == 50
    assert update_resp.json()["end_date"] == "2026-03-15"  # unchanged
    persisted_start_date = update_resp.json()["start_date"]
    persisted_end_date = update_resp.json()["end_date"]

    # 400 for end_date < start_date on partial update against existing persisted dates
    bad_update_resp = db_client.put(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        json={"start_date": "2026-03-20"},
        headers=owner_headers,
    )
    assert bad_update_resp.status_code == 400
    assert bad_update_resp.json()["code"] == "validation_failed"
    after_bad_update_resp = db_client.get(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert after_bad_update_resp.status_code == 200
    assert after_bad_update_resp.json()["start_date"] == persisted_start_date
    assert after_bad_update_resp.json()["end_date"] == persisted_end_date

    # 422 for end_date < start_date when both dates are invalid in the request payload
    bad_update_payload_resp = db_client.put(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        json={"start_date": "2026-03-20", "end_date": "2026-03-10"},
        headers=owner_headers,
    )
    assert bad_update_payload_resp.status_code == 422
    after_bad_update_payload_resp = db_client.get(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert after_bad_update_payload_resp.status_code == 200
    assert after_bad_update_payload_resp.json()["start_date"] == persisted_start_date
    assert after_bad_update_payload_resp.json()["end_date"] == persisted_end_date

    # Delete → 204, subsequent GET returns 404
    delete_resp = db_client.delete(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert delete_resp.status_code == 204

    get_after_delete = db_client.get(
        f"/api/gantt-tasks/{task_id}?user_id={owner_id}",
        headers=owner_headers,
    )
    assert get_after_delete.status_code == 404
    assert get_after_delete.json()["code"] == "not_found"

    # Cross-user 403: owner's user_id with other user's token
    create_resp2 = db_client.post(
        f"/api/gantt-tasks?user_id={other_id}",
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
        f"/api/gantt-tasks/{other_task_id}?user_id={other_id}",
        headers=owner_headers,  # owner's token, but querying other user's data
    )
    assert impersonate_resp.status_code == 403

    impersonate_update_resp = db_client.put(
        f"/api/gantt-tasks/{other_task_id}?user_id={other_id}",
        json={"name": "Hijacked"},
        headers=owner_headers,
    )
    assert impersonate_update_resp.status_code == 403

    impersonate_delete_resp = db_client.delete(
        f"/api/gantt-tasks/{other_task_id}?user_id={other_id}",
        headers=owner_headers,
    )
    assert impersonate_delete_resp.status_code == 403

    # 404 for non-existent task ID
    nonexistent_resp = db_client.get(
        f"/api/gantt-tasks/nonexistent-id?user_id={owner_id}",
        headers=owner_headers,
    )
    assert nonexistent_resp.status_code == 404
    assert nonexistent_resp.json()["code"] == "not_found"

    # 422 for end_date < start_date at request validation time
    bad_dates_resp = db_client.post(
        f"/api/gantt-tasks?user_id={owner_id}",
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
        f"/api/gantt-tasks?user_id={owner_id}",
        json={
            "name": "Over-progress task",
            "start_date": "2026-06-01",
            "end_date": "2026-06-10",
            "progress": 150,
        },
        headers=owner_headers,
    )
    assert bad_progress_resp.status_code == 422


def test_dependency_graph_validation_and_delete(db_client, auth_headers, create_user_factory):
    owner = create_user_factory(db_client, auth_headers(1, is_admin=True), "dependency-owner")
    headers = auth_headers(owner)
    payload = {"name": "Task", "start_date": "2026-03-01", "end_date": "2026-03-02"}

    def create(**extra):
        return db_client.post("/api/gantt-tasks", headers=headers, json={**payload, **extra})

    def update(task_id, dependencies):
        return db_client.put(f"/api/gantt-tasks/{task_id}", headers=headers, json={"dependencies": dependencies})

    assert create(dependencies="missing").json()["code"] == "gantt_dependency_unknown"
    a = create().json()["id"]
    b = create(dependencies=f" {a}, {a} ").json()["id"]
    c = create(dependencies=b).json()["id"]
    assert update(a, a).json()["code"] == "gantt_dependency_self"
    assert update(a, c).json()["code"] == "gantt_dependency_cycle"
    other = create_user_factory(db_client, auth_headers(1, is_admin=True), "dependency-other")
    foreign = db_client.post("/api/gantt-tasks", headers=auth_headers(other), json=payload).json()["id"]
    assert update(a, foreign).json()["code"] == "gantt_dependency_unknown"
    assert db_client.delete(f"/api/gantt-tasks/{a}", headers=headers).status_code == 204
    assert db_client.get(f"/api/gantt-tasks/{b}", headers=headers).json()["dependencies"] is None
    assert update(c, a).json()["code"] == "gantt_dependency_unknown"
    response = db_client.post(
        "/api/sync/push",
        headers=headers,
        json={
            "gantt_tasks": [
                {
                    "id": "invalid-create",
                    "action": "create",
                    "client_updated_at": "2026-11-04T12:00:00Z",
                    **payload,
                    "dependencies": "missing",
                },
                {"id": "valid-create", "action": "create", "client_updated_at": "2026-11-04T12:00:00Z", **payload},
            ]
        },
    )
    assert response.status_code == 200, response.text
    records = response.json()["results"]["gantt_tasks"]
    assert records[0]["status"] == "conflict"
    assert records[0]["code"] == "gantt_dependency_unknown"
    assert records[1]["status"] == "ok"


def test_sync_dependency_order_rejections_and_cleanup(db_client, auth_headers, create_user_factory):
    owner = create_user_factory(db_client, auth_headers(1, is_admin=True), "sync-dependency-owner")
    headers = auth_headers(owner)
    base = {
        "action": "create",
        "client_updated_at": "2099-01-01T00:00:00Z",
        "name": "Task",
        "start_date": "2026-03-01",
        "end_date": "2026-03-02",
    }

    def push(items):
        response = db_client.post("/api/sync/push", headers=headers, json={"gantt_tasks": items})
        assert response.status_code == 200, response.text
        return response.json()["results"]["gantt_tasks"]

    results = push(
        [{**base, "id": "c", "dependencies": "b"}, {**base, "id": "b", "dependencies": "a"}, {**base, "id": "a"}]
    )
    assert [record["status"] for record in results] == ["ok", "ok", "ok"]
    for dependencies, code in [
        ("a", "gantt_dependency_self"),
        ("c", "gantt_dependency_cycle"),
        ("missing", "gantt_dependency_unknown"),
    ]:
        result = push([{**base, "id": "a", "action": "update", "dependencies": dependencies}])[0]
        assert result["status"] == "conflict"
        assert result["code"] == code
        assert db_client.get("/api/gantt-tasks/a", headers=headers).json()["dependencies"] is None
    assert push([{**base, "id": "a", "action": "delete"}])[0]["status"] == "ok"
    assert db_client.get("/api/gantt-tasks/b", headers=headers).json()["dependencies"] is None
    pulled = db_client.get("/api/sync/pull", headers=headers).json()["gantt_tasks"]
    assert next(row for row in pulled if row["id"] == "b")["dependencies"] is None

    cycle = push([{**base, "id": "x", "dependencies": "y"}, {**base, "id": "y", "dependencies": "x"}])
    assert [record["code"] for record in cycle] == ["gantt_dependency_cycle", "gantt_dependency_cycle"]
    assert db_client.get("/api/gantt-tasks/x", headers=headers).status_code == 404


async def test_legacy_dependencies_remain_readable_and_editable(db_session):
    from datetime import date

    from app.database.models import GanttTask
    from app.schemas import GanttTaskUpdate, SyncPushRequest, UserCreate
    from app.services.db_service import create_user, get_gantt_task, update_gantt_task
    from app.services.sync_service import push_changes

    user = await create_user(db_session, UserCreate(username="legacy-dependencies", display_name="Legacy"))
    legacy = GanttTask(
        id="legacy",
        user_id=user.id,
        name="Legacy",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 2),
        dependencies="legacy, missing",
    )
    db_session.add(legacy)
    await db_session.commit()
    assert (await get_gantt_task(db_session, user.id, "legacy")).dependencies == "legacy, missing"
    updated = await update_gantt_task(
        db_session, user.id, "legacy", GanttTaskUpdate(name="Renamed", dependencies="legacy, missing")
    )
    assert updated.name == "Renamed"
    result = await push_changes(
        db_session,
        user.id,
        SyncPushRequest.model_validate(
            {
                "gantt_tasks": [
                    {
                        "id": "legacy",
                        "action": "update",
                        "client_updated_at": "2099-01-01T00:00:00Z",
                        "name": "Synced",
                        "dependencies": "legacy, missing",
                    }
                ]
            }
        ),
    )
    assert result.results["gantt_tasks"][0].status == "ok"


async def test_concurrent_dependency_updates_cannot_create_cycle(db_session, test_db):
    import asyncio
    from datetime import date

    import pytest
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.database.models import GanttTask
    from app.schemas import GanttTaskUpdate, UserCreate
    from app.services.db_service import TaskValidationError, create_user, update_gantt_task

    if test_db.dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL row locks")
    user = await create_user(db_session, UserCreate(username="dependency-race", display_name="Race"))
    owner_id = user.id
    for task_id in ["race-a", "race-b"]:
        db_session.add(
            GanttTask(
                id=task_id, user_id=owner_id, name=task_id, start_date=date(2026, 1, 1), end_date=date(2026, 1, 2)
            )
        )
    await db_session.commit()
    sessions = async_sessionmaker(test_db, expire_on_commit=False)

    async def write(task_id, target):
        async with sessions() as session:
            try:
                await update_gantt_task(session, owner_id, task_id, GanttTaskUpdate(dependencies=target))
                return "ok"
            except TaskValidationError as error:
                return error.code.value

    assert sorted(await asyncio.gather(write("race-a", "race-b"), write("race-b", "race-a"))) == [
        "gantt_dependency_cycle",
        "ok",
    ]
