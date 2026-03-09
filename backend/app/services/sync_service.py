"""Sync service: bidirectional push/pull for SQLite-backed entities.

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

from datetime import datetime, timezone
from typing import TypeAlias, TypeVar

from pydantic import BaseModel
from sqlalchemy import func as sql_func
from sqlmodel import Session, select

from app.database.models import (
    TimeTrackingLabel,
    TimeTrackingTask,
    TimeTrackingTemplate,
    WorkLocation,
)
from app.models.db_schemas import (
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
    return datetime.now(timezone.utc)


def _utc(dt: datetime) -> datetime:
    """Return *dt* as a timezone-aware UTC datetime.

    SQLite stores datetimes without timezone information.  SQLAlchemy returns
    them as naive ``datetime`` objects.  Client-side timestamps are
    timezone-aware (ISO 8601 with ``+00:00``).  This helper normalizes both
    ends so comparisons work correctly.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Push helpers
# ---------------------------------------------------------------------------




def _get_provided_fields(item: BaseModel) -> set[str]:
    """Get the set of fields explicitly provided by the client."""
    provided = item.model_fields_set
    if not provided and hasattr(item, "__fields_set__"):
        return item.__fields_set__
    return provided


def _validate_task_label_reference(session: Session, user_id: int, label_id: str | None) -> None:
    if label_id is None:
        return

    label = session.get(TimeTrackingLabel, label_id)
    if label is None or label.user_id != user_id or label.deleted_at is not None:
        from app.services.db_service import ValidationError
        raise ValidationError("label not found")


def _push_label(
    session: Session, user_id: int, item: LabelSyncItem
) -> SyncRecordResult:
    now = _now()
    label: TimeTrackingLabel | None = session.get(TimeTrackingLabel, item.id)

    if item.action == "delete":
        if label is None or label.user_id != user_id or label.deleted_at is not None:
            # Already absent / deleted — idempotent success.
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
        # Create (or idempotent re-create after server has no record).
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

    # Record exists — LWW check (applies to both 'create' and 'update').
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


def _push_task(
    session: Session, user_id: int, item: TaskSyncItem
) -> SyncRecordResult:
    now = _now()
    task: TimeTrackingTask | None = session.get(TimeTrackingTask, item.id)

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
        _validate_task_label_reference(session, user_id, item.label_id)
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
        _validate_task_label_reference(session, user_id, item.label_id)
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


def _push_template(
    session: Session, user_id: int, item: TemplateSyncItem
) -> SyncRecordResult:
    now = _now()
    template: TimeTrackingTemplate | None = session.get(TimeTrackingTemplate, item.id)

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
        _validate_task_label_reference(session, user_id, item.label_id)
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
        _validate_task_label_reference(session, user_id, item.label_id)
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


def _push_work_location(
    session: Session, user_id: int, item: WorkLocationSyncItem
) -> SyncRecordResult:
    """Work locations use (user_id, date) as their natural key.

    The result ``id`` is the ISO date string so the caller has a stable key.
    """
    now = _now()
    date_key = item.date.isoformat()

    location: WorkLocation | None = session.exec(
        select(WorkLocation).where(
            WorkLocation.user_id == user_id,
            WorkLocation.date == item.date,
        )
    ).first()

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


SyncEntityModel: TypeAlias = (
    TimeTrackingLabel | TimeTrackingTask | TimeTrackingTemplate | WorkLocation
)
SyncEntityModelT = TypeVar("SyncEntityModelT", bound=SyncEntityModel)


def _get_synced_entities(
    session: Session, model: type[SyncEntityModelT], user_id: int, since_naive: datetime
) -> list[SyncEntityModelT]:
    statement = (
        select(model)
        .where(
            model.user_id == user_id,
            model.updated_at > since_naive,
        )
        .order_by(model.updated_at)
    )
    return list(session.exec(statement).all())




# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def push_changes(
    session: Session, user_id: int, changes: SyncPushRequest
) -> SyncPushResponse:
    """Apply a batched set of client changes within a single transaction.

    Conflict results (LWW rejection) are returned per-record and do not abort
    the transaction.  Any other exception rolls back the whole batch.
    """
    results: dict[str, list[SyncRecordResult]] = {
        "labels": [],
        "tasks": [],
        "templates": [],
        "work_locations": [],
    }

    for item in changes.labels:
        results["labels"].append(_push_label(session, user_id, item))

    for item in changes.tasks:
        results["tasks"].append(_push_task(session, user_id, item))

    for item in changes.templates:
        results["templates"].append(_push_template(session, user_id, item))

    for item in changes.work_locations:
        results["work_locations"].append(_push_work_location(session, user_id, item))

    session.commit()
    return SyncPushResponse(results=results)


def pull_changes(
    session: Session, user_id: int, since: datetime
) -> SyncPullResponse:
    """Return all records (including soft-deleted) modified after *since*."""
    # Normalise to naive UTC so SQLite comparisons work correctly.
    since_naive = _utc(since).replace(tzinfo=None)

    labels = _get_synced_entities(session, TimeTrackingLabel, user_id, since_naive)
    tasks = _get_synced_entities(session, TimeTrackingTask, user_id, since_naive)
    templates = _get_synced_entities(session, TimeTrackingTemplate, user_id, since_naive)
    work_locations = _get_synced_entities(session, WorkLocation, user_id, since_naive)

    return SyncPullResponse(
        labels=[LabelSyncRead.model_validate(r, from_attributes=True) for r in labels],
        tasks=[TaskSyncRead.model_validate(r, from_attributes=True) for r in tasks],
        templates=[TemplateSyncRead.model_validate(r, from_attributes=True) for r in templates],
        work_locations=[WorkLocationSyncRead.model_validate(r, from_attributes=True) for r in work_locations],
        server_timestamp=_now(),
    )


def get_sync_status(session: Session, user_id: int) -> SyncStatusResponse:
    """Return the most-recent ``updated_at`` per entity type for the user."""

    def _max_ts(model, user_id: int) -> datetime | None:
        result = session.exec(
            select(sql_func.max(model.updated_at)).where(model.user_id == user_id)
        ).first()
        return result

    return SyncStatusResponse(
        labels_updated_at=_max_ts(TimeTrackingLabel, user_id),
        tasks_updated_at=_max_ts(TimeTrackingTask, user_id),
        templates_updated_at=_max_ts(TimeTrackingTemplate, user_id),
        work_locations_updated_at=_max_ts(WorkLocation, user_id),
        server_timestamp=_now(),
    )
