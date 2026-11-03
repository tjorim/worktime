"""Explicit labeled fixtures for tests whose subject is unrelated to label validation."""

from app.schemas import LabelCreate, TaskCreate, TemplateCreate
from app.services.db_service import create_label, list_labels_for_user


async def task_payload(session, user_id, **kwargs):
    labels = await list_labels_for_user(session, user_id)
    label = labels[0] if labels else await create_label(session, user_id, LabelCreate(name="Work", color="#112233"))
    return TaskCreate(label_id=label.id, **kwargs)


async def template_payload(session, user_id, **kwargs):
    labels = await list_labels_for_user(session, user_id)
    label = labels[0] if labels else await create_label(session, user_id, LabelCreate(name="Work", color="#112233"))
    return TemplateCreate(label_id=label.id, **kwargs)


def labeled_payload(client, headers, payload):
    labels = client.get("/api/time-tracking/labels", headers=headers).json()["items"]
    label = (
        labels[0]
        if labels
        else client.post("/api/time-tracking/labels", headers=headers, json={"name": "Work", "color": "#112233"}).json()
    )
    return {"label_id": label["id"], **payload}


def labeled_sync_payload(client, headers, payload):
    for resource in ["tasks", "templates"]:
        payload[resource] = [
            labeled_payload(client, headers, item)
            if "text" in item and "start_time" in item and "label_id" not in item and not item.get("deleted_at")
            else item
            for item in payload.get(resource, [])
        ]
    return payload


def label_id_for(client, headers):
    return labeled_payload(client, headers, {})["label_id"]


async def mcp_label_id(backend):
    labels = (await backend.list_labels())["labels"]
    label = labels[0] if labels else await backend.create_label(name="Work", color="#112233")
    return label["id"]
