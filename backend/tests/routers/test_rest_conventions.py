"""OpenAPI and proxy-facing contracts for canonical REST routes."""

import pytest

from app.main import app


@pytest.mark.parametrize(
    ("old_method", "old_path", "new_method", "new_path"),
    [
        ("get", "/users/", "get", "/users"),
        ("post", "/users/", "post", "/users"),
        ("put", "/users/{user_id}", "patch", "/users/{user_id}"),
        ("post", "/time-tracking/labels", "post", "/labels"),
        ("get", "/time-tracking/labels", "get", "/labels"),
        ("get", "/time-tracking/labels/{label_id}", "get", "/labels/{label_id}"),
        ("put", "/time-tracking/labels/{label_id}", "patch", "/labels/{label_id}"),
        ("delete", "/time-tracking/labels/{label_id}", "delete", "/labels/{label_id}"),
        ("put", "/time-tracking/tasks/{task_id}", "patch", "/time-tracking/tasks/{task_id}"),
        ("put", "/time-tracking/templates/{template_id}", "patch", "/time-tracking/templates/{template_id}"),
        ("put", "/gantt-tasks/{task_id}", "patch", "/gantt-tasks/{task_id}"),
        ("post", "/work-locations", "put", "/work-locations/{value_date}"),
    ],
)
def test_legacy_operations_are_deprecated(old_method, old_path, new_method, new_path):
    paths = app.openapi()["paths"]
    assert paths[f"/api{old_path}"][old_method]["deprecated"] is True
    assert not paths[f"/api{new_path}"][new_method].get("deprecated", False)


def test_sync_schema_uses_discriminated_items_and_task_specific_results():
    schemas = app.openapi()["components"]["schemas"]
    pushes = schemas["SyncPushRequest"]["properties"]
    results = schemas["SyncPushResults"]["properties"]
    entities = {"labels", "tasks", "templates", "work_locations", "time_off_entries", "gantt_tasks"}
    assert results.keys() == entities

    for entity in entities:
        item = pushes[entity]["items"]
        if "$ref" in item:
            item = schemas[item["$ref"].rsplit("/", 1)[-1]]
        discriminator = item["discriminator"]
        assert discriminator["propertyName"] == "action"
        assert discriminator["mapping"].keys() == {"create", "update", "delete"}
        result_type = "TaskSyncRecordResult" if entity == "tasks" else "SyncRecordResult"
        assert results[entity]["items"]["$ref"] == f"#/components/schemas/{result_type}"

    assert "conflicting_task_id" in schemas["TaskSyncRecordResult"]["properties"]
    assert "conflicting_task_id" not in schemas["SyncRecordResult"]["properties"]


def test_cors_preflight_allows_patch_and_preferences_opt_in(db_client):
    response = db_client.options(
        "/api/users/1",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "Authorization, Content-Type, Prefer",
        },
    )
    assert response.status_code == 200
    assert "PATCH" in response.headers["Access-Control-Allow-Methods"]


def test_sync_push_preserves_legacy_conflict_key(db_client, auth_headers, create_user_factory):
    user_id = create_user_factory(db_client, auth_headers(1, is_admin=True), "sync-result-wire")
    response = db_client.post(
        "/api/sync/push",
        headers=auth_headers(user_id),
        json={
            "labels": [{"id": "deleted-label", "action": "delete", "client_updated_at": "2026-01-01T00:00:00Z"}],
            "tasks": [{"id": "deleted-task", "action": "delete", "client_updated_at": "2026-01-01T00:00:00Z"}],
        },
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert results["labels"][0]["conflicting_task_id"] is None
    assert results["tasks"][0]["conflicting_task_id"] is None
