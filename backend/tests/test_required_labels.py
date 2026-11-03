"""Label requirements at the REST, sync, Pebble, and MCP boundaries."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.mcp_server import WorktimeMcpBackend, create_mcp_server


def setup_owner(db_client, auth_headers, create_user_factory):
    user = create_user_factory(db_client, auth_headers(1, is_admin=True), "required-label-owner")
    headers = auth_headers(user)
    label = db_client.post(
        "/api/time-tracking/labels", headers=headers, json={"name": "Work", "color": "#112233"}
    ).json()["id"]
    return user, headers, label


@pytest.mark.parametrize("resource", ["tasks", "templates"])
@pytest.mark.parametrize("label", [None, "", "  ", "missing"])
def test_requires_owned_label(db_client, auth_headers, create_user_factory, resource, label):
    _, headers, valid = setup_owner(db_client, auth_headers, create_user_factory)
    url = f"/api/time-tracking/{resource}"
    data = {"text": "Work", "start_time": "2026-01-05T09:00:00Z", "stop_time": "2026-01-05T10:00:00Z"}
    if resource == "templates":
        data.update(start_time="09:00:00", stop_time="10:00:00")
    for payload in [data, {**data, "label_id": label}]:
        rejected = db_client.post(url, headers=headers, json=payload)
        assert 400 <= rejected.status_code < 500
        assert rejected.json()["code"] == "label_required"
    created = db_client.post(url, headers=headers, json={**data, "label_id": valid})
    assert created.status_code == 201, created.text
    item_url = f"{url}/{created.json()['id']}"
    rejected = db_client.put(item_url, headers=headers, json={"label_id": label})
    assert 400 <= rejected.status_code < 500
    assert rejected.json()["code"] == "label_required"
    # Partial updates retain their existing required label.
    updated = db_client.put(item_url, headers=headers, json={"text": "Edited"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["label_id"] == valid


def test_pebble_requires_label_then_reuses_most_recent_task_label(db_client, auth_headers, create_user_factory):
    user = create_user_factory(db_client, auth_headers(1, is_admin=True), "watch-labels")
    headers = auth_headers(user)
    url = "/api/pebble/actions/clock-in"
    rejected = db_client.post(url, headers=headers)
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "label_required"
    first = db_client.post(
        "/api/time-tracking/labels", headers=headers, json={"name": "First", "color": "#112233"}
    ).json()["id"]
    fallback = db_client.post(url, headers=headers)
    assert fallback.status_code == 201, fallback.text
    assert fallback.json()["label_id"] == first
    db_client.post("/api/pebble/actions/clock-out", headers=headers)
    db_client.post("/api/time-tracking/labels", headers=headers, json={"name": "Unused", "color": "#334455"})
    latest = db_client.post(url, headers=headers)
    assert latest.status_code == 201, latest.text
    assert latest.json()["label_id"] == first


@pytest.mark.parametrize("resource", ["tasks", "templates"])
def test_sync_rejects_unlabeled_create(db_client, auth_headers, create_user_factory, resource):
    _, headers, _ = setup_owner(db_client, auth_headers, create_user_factory)
    data = {
        "id": str(uuid4()),
        "action": "create",
        "text": "Work",
        "start_time": "2026-01-05T09:00:00Z",
        "stop_time": "2026-01-05T10:00:00Z",
        "client_updated_at": datetime.now(UTC).isoformat(),
    }
    if resource == "templates":
        data.update(start_time="09:00:00", stop_time="10:00:00")
    response = db_client.post("/api/sync/push", headers=headers, json={resource: [data]})
    assert response.status_code == 200, response.text
    assert response.json()["results"][resource][0]["code"] == "label_required"


async def test_mcp_create_tools_require_labels_in_schema(test_db):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    server = create_mcp_server(async_sessionmaker(test_db, expire_on_commit=False))
    # Inspect the underlying tools before discovery transforms hide them.
    import inspect

    for name in ["start_time_entry", "create_time_tracking_task"]:
        method = getattr(WorktimeMcpBackend, name)
        assert inspect.signature(method).parameters["label_id"].default is inspect.Parameter.empty
        assert "label_id" in method.__doc__
    assert server is not None


def test_openapi_exposes_required_create_labels_and_nonnullable_updates():
    from app.main import app

    schemas = app.openapi()["components"]["schemas"]
    for name in ["TaskCreate", "TemplateCreate"]:
        assert "label_id" in schemas[name]["required"]
        assert schemas[name]["properties"]["label_id"]["type"] == "string"
    for name in ["TaskUpdate", "TemplateUpdate"]:
        assert schemas[name]["properties"]["label_id"]["type"] == "string"
