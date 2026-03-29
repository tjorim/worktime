"""Sync service: bidirectional push/pull for PostgreSQL-backed entities.

Strategy
--------
* **Push** — last-write-wins based on ``client_updated_at`` vs server
  ``updated_at``.  An entire batch is processed inside a single transaction;
  per-record *conflict* results are normal outcomes (not errors) and do **not**
  cause a roll-back.  Unexpected exceptions (e.g. constraint violations) bubble
  up and abort the whole transaction.
* **Pull** — return every record whose ``updated_at`` is strictly after *since*,
  plus soft-deleted records whose ``deleted_at`` is also after *since*.
* **Status** — return the latest ``updated_at`` timestamp per entity type so
  the client can decide whether to trigger a sync at all.

Idempotency
-----------
Labels, tasks and templates use client-generated UUIDs as primary keys.
Sending ``action='create'`` for an already-existing ID is treated as an
update (idempotent re-play).  Work locations are identified by their natural
key ``(user_id, date)`` and are always upserted.

Soft deletes
------------
``action='delete'`` sets ``deleted_at`` (and ``updated_at``) rather than
removing the row, so pull queries can propagate the deletion to other clients.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import func as sql_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    TimeTrackingLabel,
    TimeTrackingTask,
    TimeTrackingTemplate,
    WorkLocation,
)
from app.schemas import (
    LabelSyncItem,
    LabelSyncRead,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    SyncRecordResult,
    SyncStatusResponse,
    TaskSyncItem,
    TaskSyncRead,
    TemplateSyncItem,
    TemplateSyncRead,
    WorkLocationSyncItem,
    WorkLocationSyncRead,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(dt: datetime) -> datetime:
    """Return *dt* as a timezone-aware UTC datetime.

    Normalizes both naive and timezone-aware datetimes to UTC so comparisons
    work correctly with PostgreSQL's timezone-aware timestamp columns.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


# ---------------------------------------------------------------------------
# Push helpers
# ---------------------------------------------------------------------------


def _get_provided_fields(item: BaseModel) -> set[str]:
    """Get the set of fields explicitly provided by the client."""
    provided = item.model_fields_set
    if not provided and hasattr(item, "__fields_set__"):
        return item.__fields_set__
    return provided


async def _validate_task_label_reference(
    session: AsyncSession, user_id: int, label_id: str | None
) -> None:
    if label_id is None:
        return

    label = await session.get(TimeTrackingLabel, label_id)
    if label is None or label.user_id != user_id or label.deleted_at is not None:
        from app.services.db_service import ValidationError
        raise ValidationError("label not found")


async def _push_label(
    session: AsyncSession, user_id: int, item: LabelSyncItem
) -> SyncRecordResult:
    now = _now()
    label: TimeTrackingLabel | None = await session.get(TimeTrackingLabel, item.id)

    if item.action == "delete":
        if label is None or label.user_id != user_id or label.deleted_at is not None:
            return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)
        if _utc(item.client_updated_at) <= _utc(label.updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=label.updated_at,
                conflict_reason="server version is newer",
            )
        label.deleted_at = now
        label.updated_at = now
        session.add(label)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    # action == 'create' or 'update'
    if label is None:
        if item.name is None or item.color is None:
            from app.services.db_service import ValidationError
            raise ValidationError("name and color are required for label create")
        label = TimeTrackingLabel(
            id=item.id,
            user_id=user_id,
            name=item.name,
            color=item.color,
        )
        session.add(label)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if label.user_id != user_id:
        from app.services.db_service import ValidationError
        raise ValidationError("label not found")

    if _utc(item.client_updated_at) <= _utc(label.updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=label.updated_at,
            conflict_reason="server version is newer",
        )
    if item.name is not None:
        label.name = item.name
    if item.color is not None:
        label.color = item.color
    if label.deleted_at is not None:
        label.deleted_at = None
    label.updated_at = now
    session.add(label)
    return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)


async def _push_task(
    session: AsyncSession, user_id: int, item: TaskSyncItem
) -> SyncRecordResult:
    now = _now()
    task: TimeTrackingTask | None = await session.get(TimeTrackingTask, item.id)

    if item.action == "delete":
        if task is None or task.user_id != user_id or task.deleted_at is not None:
            return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)
        if _utc(item.client_updated_at) <= _utc(task.updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=task.updated_at,
                conflict_reason="server version is newer",
            )
        task.deleted_at = now
        task.updated_at = now
        session.add(task)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if task is None:
        if item.text is None or item.start_time is None:
            from app.services.db_service import ValidationError
            raise ValidationError("text and start_time are required for task create")
        await _validate_task_label_reference(session, user_id, item.label_id)
        task = TimeTrackingTask(
            id=item.id,
            user_id=user_id,
            label_id=item.label_id,
            text=item.text,
            start_time=item.start_time,
            stop_time=item.stop_time,
            includes_break=item.includes_break or False,
        )
        session.add(task)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if task.user_id != user_id:
        from app.services.db_service import ValidationError
        raise ValidationError("task not found")

    if _utc(item.client_updated_at) <= _utc(task.updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=task.updated_at,
            conflict_reason="server version is newer",
        )
    provided_fields = _get_provided_fields(item)
    if "text" in provided_fields and item.text is not None:
        task.text = item.text
    if "label_id" in provided_fields:
        await _validate_task_label_reference(session, user_id, item.label_id)
        task.label_id = item.label_id
    if "start_time" in provided_fields and item.start_time is not None:
        task.start_time = item.start_time
    if "stop_time" in provided_fields:
        task.stop_time = item.stop_time
    if "includes_break" in provided_fields and item.includes_break is not None:
        task.includes_break = item.includes_break
    if task.deleted_at is not None:
        task.deleted_at = None
    task.updated_at = now
    session.add(task)
    return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)


async def _push_template(
    session: AsyncSession, user_id: int, item: TemplateSyncItem
) -> SyncRecordResult:
    now = _now()
    template: TimeTrackingTemplate | None = await session.get(TimeTrackingTemplate, item.id)

    if item.action == "delete":
        if template is None or template.user_id != user_id or template.deleted_at is not None:
            return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)
        if _utc(item.client_updated_at) <= _utc(template.updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=template.updated_at,
                conflict_reason="server version is newer",
            )
        template.deleted_at = now
        template.updated_at = now
        session.add(template)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if template is None:
        if item.text is None or item.start_time is None or item.stop_time is None:
            from app.services.db_service import ValidationError
            raise ValidationError("text, start_time and stop_time are required for template create")
        await _validate_task_label_reference(session, user_id, item.label_id)
        template = TimeTrackingTemplate(
            id=item.id,
            user_id=user_id,
            label_id=item.label_id,
            text=item.text,
            start_time=item.start_time,
            stop_time=item.stop_time,
        )
        session.add(template)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if template.user_id != user_id:
        from app.services.db_service import ValidationError
        raise ValidationError("template not found")

    if _utc(item.client_updated_at) <= _utc(template.updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=template.updated_at,
            conflict_reason="server version is newer",
        )
    provided_fields = _get_provided_fields(item)
    if "text" in provided_fields and item.text is not None:
        template.text = item.text
    if "label_id" in provided_fields:
        await _validate_task_label_reference(session, user_id, item.label_id)
        template.label_id = item.label_id
    if "start_time" in provided_fields and item.start_time is not None:
        template.start_time = item.start_time
    if "stop_time" in provided_fields and item.stop_time is not None:
        template.stop_time = item.stop_time
    if template.deleted_at is not None:
        template.deleted_at = None
    template.updated_at = now
    session.add(template)
    return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)


async def _push_work_location(
    session: AsyncSession, user_id: int, item: WorkLocationSyncItem
) -> SyncRecordResult:
    """Work locations use (user_id, date) as their natural key."""
    now = _now()
    date_key = item.date.isoformat()

    result = await session.execute(
        select(WorkLocation).where(
            WorkLocation.user_id == user_id,
            WorkLocation.date == item.date,
        )
    )
    location: WorkLocation | None = result.scalar_one_or_none()

    if item.action == "delete":
        if location is None or location.deleted_at is not None:
            return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)
        if _utc(item.client_updated_at) <= _utc(location.updated_at):
            return SyncRecordResult(
                id=date_key,
                status="conflict",
                server_updated_at=location.updated_at,
                conflict_reason="server version is newer",
            )
        location.deleted_at = now
        location.updated_at = now
        session.add(location)
        return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)

    if location is None:
        if item.country_code is None:
            from app.services.db_service import ValidationError
            raise ValidationError("country_code is required for work_location create")
        location = WorkLocation(
            user_id=user_id,
            date=item.date,
            country_code=item.country_code,
            label=item.label,
        )
        session.add(location)
        return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)

    if _utc(item.client_updated_at) <= _utc(location.updated_at):
        return SyncRecordResult(
            id=date_key,
            status="conflict",
            server_updated_at=location.updated_at,
            conflict_reason="server version is newer",
        )
    provided_fields = _get_provided_fields(item)
    if "country_code" in provided_fields and item.country_code is not None:
        location.country_code = item.country_code
    if "label" in provided_fields:
        location.label = item.label
    if location.deleted_at is not None:
        location.deleted_at = None
    location.updated_at = now
    session.add(location)
    return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)


type SyncEntityModel = (
    TimeTrackingLabel | TimeTrackingTask | TimeTrackingTemplate | WorkLocation
)


async def _get_synced_entities[SyncEntityModelT: SyncEntityModel](
    session: AsyncSession,
    model: type[SyncEntityModelT],
    user_id: int,
    since: datetime,
) -> list[SyncEntityModelT]:
    statement = (
        select(model)
        .where(
            model.user_id == user_id,
            model.updated_at > since,
        )
        .order_by(model.updated_at)
    )
    result = await session.execute(statement)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def push_changes(
    session: AsyncSession, user_id: int, changes: SyncPushRequest
) -> SyncPushResponse:
    """Apply a batched set of client changes within a single transaction."""
    results: dict[str, list[SyncRecordResult]] = {
        "labels": [],
        "tasks": [],
        "templates": [],
        "work_locations": [],
    }

    for item in changes.labels:
        results["labels"].append(await _push_label(session, user_id, item))

    for item in changes.tasks:
        results["tasks"].append(await _push_task(session, user_id, item))

    for item in changes.templates:
        results["templates"].append(await _push_template(session, user_id, item))

    for item in changes.work_locations:
        results["work_locations"].append(await _push_work_location(session, user_id, item))

    await session.commit()
    return SyncPushResponse(results=results)


async def pull_changes(
    session: AsyncSession, user_id: int, since: datetime
) -> SyncPullResponse:
    """Return all records (including soft-deleted) modified after *since*."""
    since_utc = _utc(since)

    labels = await _get_synced_entities(session, TimeTrackingLabel, user_id, since_utc)
    tasks = await _get_synced_entities(session, TimeTrackingTask, user_id, since_utc)
    templates = await _get_synced_entities(session, TimeTrackingTemplate, user_id, since_utc)
    work_locations = await _get_synced_entities(session, WorkLocation, user_id, since_utc)

    return SyncPullResponse(
        labels=[LabelSyncRead.model_validate(r, from_attributes=True) for r in labels],
        tasks=[TaskSyncRead.model_validate(r, from_attributes=True) for r in tasks],
        templates=[TemplateSyncRead.model_validate(r, from_attributes=True) for r in templates],
        work_locations=[WorkLocationSyncRead.model_validate(r, from_attributes=True) for r in work_locations],
        server_timestamp=_now(),
    )


async def get_sync_status(session: AsyncSession, user_id: int) -> SyncStatusResponse:
    """Return the most-recent ``updated_at`` per entity type for the user."""

    async def _max_ts(model, user_id: int) -> datetime | None:
        result = await session.execute(
            select(sql_func.max(model.updated_at)).where(model.user_id == user_id)
        )
        return result.scalar_one_or_none()

    return SyncStatusResponse(
        labels_updated_at=await _max_ts(TimeTrackingLabel, user_id),
        tasks_updated_at=await _max_ts(TimeTrackingTask, user_id),
        templates_updated_at=await _max_ts(TimeTrackingTemplate, user_id),
        work_locations_updated_at=await _max_ts(WorkLocation, user_id),
        server_timestamp=_now(),
    )
