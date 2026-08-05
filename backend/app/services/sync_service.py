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

from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel
from sqlalchemy import func as sql_func
from sqlalchemy import literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.database.models import (
    GanttTask,
    Label,
    TimeOffEntry,
    TimeTrackingTask,
    TimeTrackingTemplate,
    UserPreferences,
    WorkLocation,
)
from app.schemas import (
    GanttTaskSyncItem,
    GanttTaskSyncRead,
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
    TimeOffEntrySyncDeleteItem,
    TimeOffEntrySyncItem,
    TimeOffEntrySyncRead,
    WorkLocationSyncItem,
    WorkLocationSyncRead,
)
from app.services.db_service import _validate_task_gantt_reference, apply_time_off_shape
from app.utils.datetime import as_utc


def _now() -> datetime:
    return datetime.now(UTC)


# Safety overlap subtracted from the server_timestamp reported by pull_changes
# and get_sync_status (clients persist either value as their sync cursor).
#
# Push handlers stamp ``updated_at`` when they process a record, but the row
# only becomes visible to other transactions at commit time.  A pull that runs
# concurrently can therefore return a ``server_timestamp`` *later* than the
# ``updated_at`` of a record it never saw — and a client storing that value as
# its cursor would skip the record forever.  Reporting a slightly older
# timestamp makes the next incremental pull re-read the recent window instead.
# Re-delivered records are harmless: clients apply pulls idempotently via
# last-write-wins.
_PULL_CURSOR_OVERLAP = timedelta(seconds=30)

# Upper bound on how far into the future a client-supplied client_updated_at
# is trusted, relative to the server's own clock.
#
# LWW conflict detection is a pure ">" comparison on this field with no other
# tiebreaker, so a device with a badly wrong clock (or a unit bug — e.g.
# sending milliseconds where seconds were expected, landing sometime in the
# year 48000) would otherwise win every future comparison unconditionally,
# permanently freezing that record: no other device could ever generate a
# "later" timestamp to overwrite it, including a subsequent correction from
# the same device once its clock is fixed. Clamping bounds the damage to
# _MAX_CLOCK_SKEW of un-overwritable time instead of forever.
_MAX_CLOCK_SKEW = timedelta(minutes=5)


def _clamp_client_timestamp(client_updated_at: datetime) -> datetime:
    """Clamp a client-supplied timestamp to at most _MAX_CLOCK_SKEW into the future."""
    return min(as_utc(client_updated_at), _now() + _MAX_CLOCK_SKEW)


# ---------------------------------------------------------------------------
# Bulk-delete circuit breaker
# ---------------------------------------------------------------------------

# A push is refused when it would tombstone at least BULK_DELETE_MIN_RECORDS
# currently-active rows *and* that is at least BULK_DELETE_FRACTION of
# everything the account still has, unless the client sets
# ``allow_bulk_delete`` on the request.
#
# The failure this guards against is a client that pushes an *empty* local
# snapshot as the new truth: the first-sync "keep local data" path turns every
# server row that has no local counterpart into a delete, so a device whose
# in-memory collections have not finished loading asks the server to erase the
# whole account.  Nothing in the wire format distinguishes that from a user who
# genuinely cleared their data, so the deliberate case has to say so explicitly.
#
# Thresholds are set so only an effective account wipe trips the guard: a user
# pruning even most of their history stays under BULK_DELETE_FRACTION, and
# small accounts stay under BULK_DELETE_MIN_RECORDS where the blast radius is
# small anyway.
BULK_DELETE_MIN_RECORDS = 25
BULK_DELETE_FRACTION = 0.9


class BulkDeleteGuardError(Exception):
    """A push would remove most of the account's data without opting in."""

    def __init__(self, deleted: int, active: int) -> None:
        self.deleted = deleted
        self.active = active
        super().__init__(
            f"refusing to delete {deleted} of {active} records in one push; "
            "resend with allow_bulk_delete once the user has confirmed"
        )


async def _count_active(
    session: AsyncSession, model: type[SyncEntityModel], user_id: int
) -> int:
    return (
        await session.scalar(
            select(sql_func.count())
            .select_from(model)
            .where(model.user_id == user_id, model.deleted_at.is_(None))
        )
    ) or 0


async def _count_active_in(
    session: AsyncSession,
    model: type[SyncEntityModel],
    user_id: int,
    column: InstrumentedAttribute[Any],
    keys: list[Any],
) -> int:
    """Count the user's active rows whose key is in *keys* (0 for an empty list)."""
    if not keys:
        return 0
    return (
        await session.scalar(
            select(sql_func.count())
            .select_from(model)
            .where(model.user_id == user_id, model.deleted_at.is_(None), column.in_(keys))
        )
    ) or 0


async def _assert_not_bulk_delete(
    session: AsyncSession, user_id: int, changes: SyncPushRequest
) -> None:
    """Raise BulkDeleteGuardError when *changes* would wipe most of the account.

    Only deletes that would actually tombstone a currently-active row are
    counted.  Replayed deletes for rows that are already gone (a re-flushed
    outbox is full of them) must not count towards the threshold, or a client
    that legitimately retries would deadlock against its own earlier success.
    """
    if changes.allow_bulk_delete:
        return

    scopes = (
        (Label, Label.id, changes.labels, "id"),
        (GanttTask, GanttTask.id, changes.gantt_tasks, "id"),
        (TimeTrackingTask, TimeTrackingTask.id, changes.tasks, "id"),
        (TimeTrackingTemplate, TimeTrackingTemplate.id, changes.templates, "id"),
        (WorkLocation, WorkLocation.date, changes.work_locations, "date"),
        (TimeOffEntry, TimeOffEntry.entry_id, changes.time_off_entries, "id"),
    )

    deleted = 0
    for model, column, items, key_attr in scopes:
        keys = [getattr(item, key_attr) for item in items if item.action == "delete"]
        deleted += await _count_active_in(session, model, user_id, column, keys)

    # Judge against the whole logical push when the client declared one. A
    # chunked destructive batch would otherwise slip its first chunk past the
    # guard and only be refused partway through, leaving the account partly
    # erased — see declared_delete_total in app/schemas.py.
    if changes.declared_delete_total is not None:
        deleted = max(deleted, changes.declared_delete_total)

    if deleted < BULK_DELETE_MIN_RECORDS:
        return

    active = 0
    for model, _column, _items, _key_attr in scopes:
        active += await _count_active(session, model, user_id)

    if active > 0 and deleted >= BULK_DELETE_FRACTION * active:
        raise BulkDeleteGuardError(deleted, active)


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

    label = await session.get(Label, label_id)
    if label is None or label.user_id != user_id or label.deleted_at is not None:
        from app.services.db_service import ValidationError
        raise ValidationError("label not found")


async def _label_name_taken(
    session: AsyncSession, user_id: int, name: str, *, exclude_id: str | None
) -> bool:
    """Whether another *active* label already owns (user_id, name).

    Mirrors the ``uq_active_label_user_name`` partial unique index so callers
    can return a per-record conflict instead of letting the INSERT/UPDATE hit
    that constraint at commit time — which would raise ``IntegrityError`` for
    the whole batch (one transaction covers every record in the push), not
    just the offending label.
    """
    conditions = [
        Label.user_id == user_id,
        Label.name == name,
        Label.deleted_at.is_(None),
    ]
    if exclude_id is not None:
        conditions.append(Label.id != exclude_id)
    result = await session.execute(select(Label.id).where(*conditions).limit(1))
    return result.scalar_one_or_none() is not None


async def _push_label(
    session: AsyncSession, user_id: int, item: LabelSyncItem
) -> SyncRecordResult:
    now = _now()
    label: Label | None = await session.get(Label, item.id)

    if item.action == "delete":
        if label is None or label.user_id != user_id or label.deleted_at is not None:
            return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)
        if _clamp_client_timestamp(item.client_updated_at) <= as_utc(label.client_updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=label.updated_at,
                conflict_reason="server version is newer",
            )
        # Only *active* references block deletion — soft-deleted tasks/templates
        # must not pin their label forever (mirrors db_service.delete_label).
        task_count = await session.scalar(
            select(sql_func.count())
            .select_from(TimeTrackingTask)
            .where(TimeTrackingTask.label_id == item.id, TimeTrackingTask.deleted_at.is_(None))
        )
        template_count = await session.scalar(
            select(sql_func.count())
            .select_from(TimeTrackingTemplate)
            .where(TimeTrackingTemplate.label_id == item.id, TimeTrackingTemplate.deleted_at.is_(None))
        )
        gantt_task_count = await session.scalar(
            select(sql_func.count())
            .select_from(GanttTask)
            .where(GanttTask.label_id == item.id, GanttTask.deleted_at.is_(None))
        )
        if task_count or template_count or gantt_task_count:
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=label.updated_at,
                conflict_reason="label is in use by tasks, templates, or gantt tasks and cannot be deleted",
            )
        label.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
        label.deleted_at = now
        label.updated_at = now
        session.add(label)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    # action == 'create' or 'update'
    if label is None:
        if item.name is None or item.color is None:
            from app.services.db_service import ValidationError
            raise ValidationError("name and color are required for label create")
        if await _label_name_taken(session, user_id, item.name, exclude_id=None):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                conflict_reason="a label with this name already exists",
            )
        label = Label(
            id=item.id,
            user_id=user_id,
            name=item.name,
            color=item.color,
            client_updated_at=_clamp_client_timestamp(item.client_updated_at),
        )
        session.add(label)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if label.user_id != user_id:
        # The id collides with another user's label. Returning a per-record
        # conflict (rather than raising, which would 400 the whole batch) both
        # keeps the rest of the batch processing and avoids leaking whether
        # the id belongs to someone else vs. genuinely being stale — same
        # response shape as an ordinary LWW conflict either way.
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            conflict_reason="server version is newer",
        )

    if _clamp_client_timestamp(item.client_updated_at) <= as_utc(label.client_updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=label.updated_at,
            conflict_reason="server version is newer",
        )
    new_name = item.name if item.name is not None else label.name
    is_reviving = label.deleted_at is not None
    # A rename or a revival-from-soft-delete can each collide with another
    # active label that already holds that name — a same-name, no-op update
    # (name unchanged, already active) cannot, so skip the check there to
    # avoid a spurious self-collision false positive.
    if (new_name != label.name or is_reviving) and await _label_name_taken(
        session, user_id, new_name, exclude_id=label.id
    ):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=label.updated_at,
            conflict_reason="a label with this name already exists",
        )
    if item.name is not None:
        label.name = item.name
    if item.color is not None:
        label.color = item.color
    if is_reviving:
        label.deleted_at = None
    label.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
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
        if _clamp_client_timestamp(item.client_updated_at) <= as_utc(task.client_updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=task.updated_at,
                conflict_reason="server version is newer",
            )
        task.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
        task.deleted_at = now
        task.updated_at = now
        session.add(task)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if task is None:
        if item.text is None or item.start_time is None:
            from app.services.db_service import ValidationError
            raise ValidationError("text and start_time are required for task create")
        if item.stop_time is not None and as_utc(item.stop_time) < as_utc(item.start_time):
            from app.services.db_service import ValidationError
            raise ValidationError("stop_time cannot be earlier than start_time")
        await _validate_task_label_reference(session, user_id, item.label_id)
        await _validate_task_gantt_reference(session, user_id, item.gantt_task_id)
        task = TimeTrackingTask(
            id=item.id,
            user_id=user_id,
            label_id=item.label_id,
            gantt_task_id=item.gantt_task_id,
            text=item.text,
            start_time=item.start_time,
            stop_time=item.stop_time,
            includes_break=item.includes_break or False,
            client_updated_at=_clamp_client_timestamp(item.client_updated_at),
        )
        session.add(task)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if task.user_id != user_id:
        # See the equivalent check in _push_label: a per-record conflict
        # keeps the rest of the batch processing and avoids an id-ownership
        # oracle, rather than raising and 400ing the whole batch.
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            conflict_reason="server version is newer",
        )

    if _clamp_client_timestamp(item.client_updated_at) <= as_utc(task.client_updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=task.updated_at,
            conflict_reason="server version is newer",
        )
    provided_fields = _get_provided_fields(item) - {"action", "client_updated_at"}
    candidate_start_time = (
        item.start_time
        if "start_time" in provided_fields and item.start_time is not None
        else task.start_time
    )
    candidate_stop_time = item.stop_time if "stop_time" in provided_fields else task.stop_time
    if candidate_stop_time is not None and as_utc(candidate_stop_time) < as_utc(candidate_start_time):
        from app.services.db_service import ValidationError
        raise ValidationError("stop_time cannot be earlier than start_time")
    if "text" in provided_fields and item.text is not None:
        task.text = item.text
    if "label_id" in provided_fields:
        await _validate_task_label_reference(session, user_id, item.label_id)
        task.label_id = item.label_id
    if "gantt_task_id" in provided_fields:
        await _validate_task_gantt_reference(session, user_id, item.gantt_task_id)
        task.gantt_task_id = item.gantt_task_id
    if "start_time" in provided_fields and item.start_time is not None:
        task.start_time = item.start_time
    if "stop_time" in provided_fields:
        task.stop_time = item.stop_time
    if "includes_break" in provided_fields and item.includes_break is not None:
        task.includes_break = item.includes_break
    if task.deleted_at is not None:
        task.deleted_at = None
    task.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
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
        if _clamp_client_timestamp(item.client_updated_at) <= as_utc(template.client_updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=template.updated_at,
                conflict_reason="server version is newer",
            )
        template.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
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
            client_updated_at=_clamp_client_timestamp(item.client_updated_at),
        )
        session.add(template)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if template.user_id != user_id:
        # See the equivalent check in _push_label.
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            conflict_reason="server version is newer",
        )

    if _clamp_client_timestamp(item.client_updated_at) <= as_utc(template.client_updated_at):
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
    template.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
    template.updated_at = now
    session.add(template)
    return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)


async def _push_work_location(
    session: AsyncSession, user_id: int, item: WorkLocationSyncItem
) -> SyncRecordResult:
    """Work locations use (user_id, date) as their natural key."""
    now = _now()
    date_key = item.date.isoformat()

    # The unique index on (user_id, date) is partial (active rows only), so
    # multiple soft-deleted rows are legal at the schema level.  Pick the
    # active row if one exists, otherwise the most recently updated tombstone,
    # instead of scalar_one_or_none() which would raise on duplicates and
    # abort the whole push batch.
    result = await session.execute(
        select(WorkLocation)
        .where(
            WorkLocation.user_id == user_id,
            WorkLocation.date == item.date,
        )
        .order_by(WorkLocation.deleted_at.is_(None).desc(), WorkLocation.updated_at.desc())
        .limit(1)
    )
    location: WorkLocation | None = result.scalars().first()

    if item.action == "delete":
        if location is None or location.deleted_at is not None:
            return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)
        if _clamp_client_timestamp(item.client_updated_at) <= as_utc(location.client_updated_at):
            return SyncRecordResult(
                id=date_key,
                status="conflict",
                server_updated_at=location.updated_at,
                conflict_reason="server version is newer",
            )
        location.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
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
            client_updated_at=_clamp_client_timestamp(item.client_updated_at),
        )
        session.add(location)
        return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)

    if _clamp_client_timestamp(item.client_updated_at) <= as_utc(location.client_updated_at):
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
    location.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
    location.updated_at = now
    session.add(location)
    return SyncRecordResult(id=date_key, status="ok", server_updated_at=now)


async def _push_time_off_entry(
    session: AsyncSession, user_id: int, item: TimeOffEntrySyncItem
) -> SyncRecordResult:
    """Time-off entries use (user_id, entry_id) as their natural key."""
    now = _now()
    provided_fields = _get_provided_fields(item) - {"id", "action", "client_updated_at"}

    result = await session.execute(
        select(TimeOffEntry).where(
            TimeOffEntry.user_id == user_id,
            TimeOffEntry.entry_id == item.id,
        )
    )
    entry: TimeOffEntry | None = result.scalar_one_or_none()

    if isinstance(item, TimeOffEntrySyncDeleteItem):
        if entry is None or entry.deleted_at is not None:
            return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)
        if _clamp_client_timestamp(item.client_updated_at) <= as_utc(entry.client_updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=entry.updated_at,
                conflict_reason="server version is newer",
            )
        entry.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
        entry.deleted_at = now
        entry.updated_at = now
        session.add(entry)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if entry is None:
        if item.action == "update" and item.entry_kind is None:
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                conflict_reason="record does not exist for patch update",
            )

        # Create items always provide a full shape; update items can upsert when they do.
        if item.entry_kind is None:
            from app.services.db_service import ValidationError
            raise ValidationError("entry_kind is required to create a time-off entry")
        entry = TimeOffEntry(
            entry_id=item.id,
            user_id=user_id,
            entry_type=item.entry_type or "vacation",
            entry_flag=item.entry_flag or "full_day",
            note=item.note,
        )
        apply_time_off_shape(
            entry,
            kind=item.entry_kind,
            value_date=item.date,
            start_date=item.start_date,
            end_date=item.end_date,
            weekday=item.weekday,
        )
        entry.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
        session.add(entry)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if _clamp_client_timestamp(item.client_updated_at) <= as_utc(entry.client_updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=entry.updated_at,
            conflict_reason="server version is newer",
        )
    if "entry_kind" in provided_fields and item.entry_kind is not None:
        apply_time_off_shape(
            entry,
            kind=item.entry_kind,
            value_date=item.date,
            start_date=item.start_date,
            end_date=item.end_date,
            weekday=item.weekday,
        )
    if "entry_type" in provided_fields and item.entry_type is not None:
        entry.entry_type = item.entry_type
    if "entry_flag" in provided_fields and item.entry_flag is not None:
        entry.entry_flag = item.entry_flag
    if "note" in provided_fields:
        entry.note = item.note
    if entry.deleted_at is not None:
        entry.deleted_at = None
    entry.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
    entry.updated_at = now
    session.add(entry)
    return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)


async def _push_gantt_task(
    session: AsyncSession, user_id: int, item: GanttTaskSyncItem
) -> SyncRecordResult:
    now = _now()
    task: GanttTask | None = await session.get(GanttTask, item.id)

    if item.action == "delete":
        if task is None or task.user_id != user_id or task.deleted_at is not None:
            return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)
        if _clamp_client_timestamp(item.client_updated_at) <= as_utc(task.client_updated_at):
            return SyncRecordResult(
                id=item.id,
                status="conflict",
                server_updated_at=task.updated_at,
                conflict_reason="server version is newer",
            )
        task.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
        task.deleted_at = now
        task.updated_at = now
        session.add(task)
        # Scoped to this user's still-active tasks: an unscoped update would
        # also rewrite rows the deleting user does not own, and re-stamping
        # already-tombstoned tasks pushes them back down to every client on the
        # next pull for no reason.
        await session.execute(
            update(TimeTrackingTask)
            .where(
                TimeTrackingTask.gantt_task_id == task.id,
                TimeTrackingTask.user_id == user_id,
                TimeTrackingTask.deleted_at.is_(None),
            )
            .values(gantt_task_id=None, client_updated_at=now, updated_at=now)
        )
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if task is None:
        if item.name is None or item.start_date is None or item.end_date is None:
            from app.services.db_service import ValidationError
            raise ValidationError("name, start_date and end_date are required for gantt task create")
        await _validate_task_label_reference(session, user_id, item.label_id)
        task = GanttTask(
            id=item.id,
            user_id=user_id,
            label_id=item.label_id,
            name=item.name,
            start_date=item.start_date,
            end_date=item.end_date,
            progress=item.progress or 0,
            dependencies=item.dependencies,
            notes=item.notes,
            client_updated_at=_clamp_client_timestamp(item.client_updated_at),
        )
        session.add(task)
        return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)

    if task.user_id != user_id:
        # See the equivalent check in _push_label.
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            conflict_reason="server version is newer",
        )

    if _clamp_client_timestamp(item.client_updated_at) <= as_utc(task.client_updated_at):
        return SyncRecordResult(
            id=item.id,
            status="conflict",
            server_updated_at=task.updated_at,
            conflict_reason="server version is newer",
        )
    provided_fields = _get_provided_fields(item) - {"action", "client_updated_at"}
    if "name" in provided_fields and item.name is not None:
        task.name = item.name
    if "label_id" in provided_fields:
        await _validate_task_label_reference(session, user_id, item.label_id)
        task.label_id = item.label_id
    if "start_date" in provided_fields and item.start_date is not None:
        task.start_date = item.start_date
    if "end_date" in provided_fields and item.end_date is not None:
        task.end_date = item.end_date
    if "progress" in provided_fields and item.progress is not None:
        task.progress = item.progress
    if "dependencies" in provided_fields:
        task.dependencies = item.dependencies
    if "notes" in provided_fields:
        task.notes = item.notes
    if task.deleted_at is not None:
        task.deleted_at = None
    task.client_updated_at = _clamp_client_timestamp(item.client_updated_at)
    task.updated_at = now
    session.add(task)
    return SyncRecordResult(id=item.id, status="ok", server_updated_at=now)


type SyncEntityModel = (
    Label | TimeTrackingTask | TimeTrackingTemplate | WorkLocation | TimeOffEntry | GanttTask
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
        "time_off_entries": [],
        "gantt_tasks": [],
    }

    # Checked before anything is mutated so a refused batch leaves no partial
    # state behind.
    await _assert_not_bulk_delete(session, user_id, changes)

    # Referenced entities are processed before the entities that link to them:
    # labels and gantt tasks must exist before tasks/templates that reference
    # them are validated.  A first-sync upload sends everything in one batch,
    # so processing tasks before gantt tasks would reject any task carrying a
    # gantt_task_id link with "gantt task not found".
    for item in changes.labels:
        results["labels"].append(await _push_label(session, user_id, item))

    for item in changes.gantt_tasks:
        results["gantt_tasks"].append(await _push_gantt_task(session, user_id, item))

    for item in changes.tasks:
        results["tasks"].append(await _push_task(session, user_id, item))

    for item in changes.templates:
        results["templates"].append(await _push_template(session, user_id, item))

    for item in changes.work_locations:
        results["work_locations"].append(await _push_work_location(session, user_id, item))

    for item in changes.time_off_entries:
        results["time_off_entries"].append(await _push_time_off_entry(session, user_id, item))

    await session.commit()
    return SyncPushResponse(results=results)


async def pull_changes(
    session: AsyncSession, user_id: int, since: datetime
) -> SyncPullResponse:
    """Return all records (including soft-deleted) modified after *since*."""
    since_utc = as_utc(since)

    labels = await _get_synced_entities(session, Label, user_id, since_utc)
    tasks = await _get_synced_entities(session, TimeTrackingTask, user_id, since_utc)
    templates = await _get_synced_entities(session, TimeTrackingTemplate, user_id, since_utc)
    work_locations = await _get_synced_entities(session, WorkLocation, user_id, since_utc)
    time_off_entries = await _get_synced_entities(session, TimeOffEntry, user_id, since_utc)
    gantt_tasks = await _get_synced_entities(session, GanttTask, user_id, since_utc)

    return SyncPullResponse(
        labels=[LabelSyncRead.model_validate(r, from_attributes=True) for r in labels],
        tasks=[TaskSyncRead.model_validate(r, from_attributes=True) for r in tasks],
        templates=[TemplateSyncRead.model_validate(r, from_attributes=True) for r in templates],
        work_locations=[WorkLocationSyncRead.model_validate(r, from_attributes=True) for r in work_locations],
        time_off_entries=[TimeOffEntrySyncRead.model_validate(r, from_attributes=True) for r in time_off_entries],
        gantt_tasks=[GanttTaskSyncRead.model_validate(r, from_attributes=True) for r in gantt_tasks],
        server_timestamp=_now() - _PULL_CURSOR_OVERLAP,
    )


type _StatusEntityModel = SyncEntityModel | UserPreferences

_STATUS_ENTITY_MODELS: tuple[tuple[str, type[_StatusEntityModel]], ...] = (
    ("labels", Label),
    ("tasks", TimeTrackingTask),
    ("templates", TimeTrackingTemplate),
    ("work_locations", WorkLocation),
    ("time_off_entries", TimeOffEntry),
    ("gantt_tasks", GanttTask),
    ("preferences", UserPreferences),
)


async def get_sync_status(session: AsyncSession, user_id: int) -> SyncStatusResponse:
    """Return the most-recent ``updated_at`` per entity type for the user.

    A single UNION ALL query replaces what used to be 7 sequential
    round-trips (one MAX(updated_at) query per entity type plus one for
    preferences) — AsyncSession only supports one in-flight statement at a
    time anyway, so those awaits were purely serial latency, not parallel
    work. Each subquery is an unconditional MAX() with no GROUP BY, so it
    always returns exactly one row (NULL when the user has no rows for that
    entity), keeping the UNION ALL at a fixed 7 rows.
    """
    subqueries = [
        select(
            literal(entity).label("entity"),
            sql_func.max(model.updated_at).label("updated_at"),
        ).where(model.user_id == user_id)
        for entity, model in _STATUS_ENTITY_MODELS
    ]
    combined = subqueries[0].union_all(*subqueries[1:])
    result = await session.execute(combined)
    by_entity: dict[str, datetime | None] = {row.entity: row.updated_at for row in result}

    return SyncStatusResponse(
        labels_updated_at=by_entity.get("labels"),
        tasks_updated_at=by_entity.get("tasks"),
        templates_updated_at=by_entity.get("templates"),
        work_locations_updated_at=by_entity.get("work_locations"),
        time_off_entries_updated_at=by_entity.get("time_off_entries"),
        gantt_tasks_updated_at=by_entity.get("gantt_tasks"),
        preferences_updated_at=by_entity.get("preferences"),
        server_timestamp=_now() - _PULL_CURSOR_OVERLAP,
    )
