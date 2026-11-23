"""Offline sync (push/pull/status) and per-user data export schemas."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from datetime import time as dt_time
from typing import Annotated, Any, Literal

from pydantic import Field, SerializerFunctionWrapHandler, model_serializer, model_validator

from app.schemas.base import NonEmptyText, RequestModel, ResponseModel
from app.schemas.time_off import EntryFlag, EntryKind, EntryType


class SyncRecordResult(ResponseModel):
    """Result for a single record in a sync push batch."""

    id: str
    status: Literal["ok", "conflict"]
    server_updated_at: dt_datetime | None = None
    conflict_reason: str | None = None
    code: str | None = None

    @model_serializer(mode="wrap")
    def _serialize_legacy_conflict_key(self, handler: SerializerFunctionWrapHandler):
        data = handler(self)
        # Older clients received this key for every entity. Its value is meaningful only for tasks.
        data.setdefault("conflicting_task_id", None)
        return data


class TaskSyncRecordResult(SyncRecordResult):
    conflicting_task_id: str | None = None


# Sync read schemas — include updated_at and deleted_at for pull responses.
class LabelSyncRead(ResponseModel):
    id: str
    user_id: int
    name: str
    color: str
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class TaskSyncRead(ResponseModel):
    id: str
    user_id: int
    label_id: str | None
    gantt_task_id: str | None
    text: str
    start_time: dt_datetime
    stop_time: dt_datetime | None
    includes_break: bool
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class TemplateSyncRead(ResponseModel):
    id: str
    user_id: int
    label_id: str | None
    text: str
    start_time: dt_time
    stop_time: dt_time
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class WorkLocationSyncRead(ResponseModel):
    id: int
    user_id: int
    date: dt_date
    country_code: str
    label: str | None
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class TimeOffEntrySyncRead(ResponseModel):
    """Sync read shape for a time-off entry (includes soft-delete fields)."""

    id: int
    entry_id: str
    user_id: int
    entry_kind: EntryKind
    date: dt_date | None
    start_date: dt_date | None
    end_date: dt_date | None
    weekday: int | None
    entry_type: EntryType
    entry_flag: EntryFlag
    note: str | None
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


# Keep accepting optional payload fields on legacy deletes. For non-Gantt creates,
# required values are checked per record by the sync service so a rejected create
# does not invalidate the whole batch.
class LabelSyncFields(RequestModel):
    id: str
    client_updated_at: dt_datetime
    name: str | None = None
    color: str | None = None


class LabelSyncCreateItem(LabelSyncFields):
    action: Literal["create"]


class LabelSyncUpdateItem(LabelSyncFields):
    action: Literal["update"]


class LabelSyncDeleteItem(LabelSyncFields):
    action: Literal["delete"]


type LabelSyncItem = Annotated[
    LabelSyncCreateItem | LabelSyncUpdateItem | LabelSyncDeleteItem,
    Field(discriminator="action"),
]


class TaskSyncFields(RequestModel):
    id: str
    client_updated_at: dt_datetime
    label_id: str | None = None
    gantt_task_id: str | None = None
    text: str | None = None
    start_time: dt_datetime | None = None
    stop_time: dt_datetime | None = None
    includes_break: bool | None = None


class TaskSyncCreateItem(TaskSyncFields):
    action: Literal["create"]


class TaskSyncUpdateItem(TaskSyncFields):
    action: Literal["update"]


class TaskSyncDeleteItem(TaskSyncFields):
    action: Literal["delete"]


type TaskSyncItem = Annotated[
    TaskSyncCreateItem | TaskSyncUpdateItem | TaskSyncDeleteItem,
    Field(discriminator="action"),
]


class TemplateSyncFields(RequestModel):
    id: str
    client_updated_at: dt_datetime
    label_id: str | None = None
    text: str | None = None
    start_time: dt_time | None = None
    stop_time: dt_time | None = None


class TemplateSyncCreateItem(TemplateSyncFields):
    action: Literal["create"]


class TemplateSyncUpdateItem(TemplateSyncFields):
    action: Literal["update"]


class TemplateSyncDeleteItem(TemplateSyncFields):
    action: Literal["delete"]


type TemplateSyncItem = Annotated[
    TemplateSyncCreateItem | TemplateSyncUpdateItem | TemplateSyncDeleteItem,
    Field(discriminator="action"),
]


class WorkLocationSyncFields(RequestModel):
    """Work locations are identified by date (natural key) rather than an integer PK."""

    date: dt_date
    client_updated_at: dt_datetime
    country_code: str | None = None
    label: str | None = None


class WorkLocationSyncCreateItem(WorkLocationSyncFields):
    action: Literal["create"]


class WorkLocationSyncUpdateItem(WorkLocationSyncFields):
    action: Literal["update"]


class WorkLocationSyncDeleteItem(WorkLocationSyncFields):
    action: Literal["delete"]


type WorkLocationSyncItem = Annotated[
    WorkLocationSyncCreateItem | WorkLocationSyncUpdateItem | WorkLocationSyncDeleteItem,
    Field(discriminator="action"),
]


class TimeOffEntrySyncItemBase(RequestModel):
    """Time-off entries are identified by a stable client-generated entry id."""

    id: NonEmptyText
    client_updated_at: dt_datetime


class TimeOffEntrySyncPayloadBase(TimeOffEntrySyncItemBase):
    date: dt_date | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None
    weekday: int | None = None
    note: str | None = None


def _validate_time_off_shape(
    entry_kind: EntryKind | None,
    date: dt_date | None,
    start_date: dt_date | None,
    end_date: dt_date | None,
    weekday: int | None,
    *,
    require_kind: bool,
) -> None:
    if entry_kind == "date":
        if date is None:
            raise ValueError("date is required for date entries")
        return

    if entry_kind == "range":
        if start_date is None or end_date is None:
            raise ValueError("start_date and end_date are required for range entries")
        if end_date <= start_date:
            raise ValueError("end_date must be after start_date; use entry_kind='date' for single-day entries")
        return

    if entry_kind == "weekly":
        if weekday is None or weekday < 1 or weekday > 7:
            raise ValueError("weekday must be between 1 and 7 for weekly entries")
        return

    shape_fields = {date, start_date, end_date, weekday}
    if require_kind or any(value is not None for value in shape_fields):
        raise ValueError("entry_kind is required for non-delete time_off_entries")


class TimeOffEntrySyncCreateItem(TimeOffEntrySyncPayloadBase):
    action: Literal["create"]
    entry_kind: EntryKind
    entry_type: EntryType = "vacation"
    entry_flag: EntryFlag = "full_day"

    @model_validator(mode="after")
    def validate_shape(self) -> TimeOffEntrySyncCreateItem:
        _validate_time_off_shape(
            self.entry_kind,
            self.date,
            self.start_date,
            self.end_date,
            self.weekday,
            require_kind=True,
        )
        return self


class TimeOffEntrySyncUpdateItem(TimeOffEntrySyncPayloadBase):
    action: Literal["update"]
    entry_kind: EntryKind | None = None
    entry_type: EntryType | None = None
    entry_flag: EntryFlag | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> TimeOffEntrySyncUpdateItem:
        if "entry_kind" in self.model_fields_set and self.entry_kind is None:
            raise ValueError("entry_kind cannot be null for update time_off_entries")
        if "entry_type" in self.model_fields_set and self.entry_type is None:
            raise ValueError("entry_type cannot be null for update time_off_entries")
        if "entry_flag" in self.model_fields_set and self.entry_flag is None:
            raise ValueError("entry_flag cannot be null for update time_off_entries")
        _validate_time_off_shape(
            self.entry_kind,
            self.date,
            self.start_date,
            self.end_date,
            self.weekday,
            require_kind=False,
        )
        return self


class TimeOffEntrySyncDeleteItem(TimeOffEntrySyncItemBase):
    action: Literal["delete"]


type TimeOffEntrySyncItem = Annotated[
    TimeOffEntrySyncCreateItem | TimeOffEntrySyncUpdateItem | TimeOffEntrySyncDeleteItem,
    Field(discriminator="action"),
]


class GanttTaskSyncBase(RequestModel):
    id: str
    client_updated_at: dt_datetime
    label_id: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    dependencies: str | None = None
    notes: str | None = None


class GanttTaskSyncFields(GanttTaskSyncBase):
    name: str | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> GanttTaskSyncFields:
        if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class GanttTaskSyncCreateItem(GanttTaskSyncBase):
    action: Literal["create"]
    name: str
    start_date: dt_date
    end_date: dt_date

    @model_validator(mode="after")
    def validate_date_range(self) -> GanttTaskSyncCreateItem:
        if self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class GanttTaskSyncUpdateItem(GanttTaskSyncFields):
    action: Literal["update"]


class GanttTaskSyncDeleteItem(GanttTaskSyncFields):
    action: Literal["delete"]


type GanttTaskSyncItem = Annotated[
    GanttTaskSyncCreateItem | GanttTaskSyncUpdateItem | GanttTaskSyncDeleteItem,
    Field(discriminator="action"),
]


class GanttTaskSyncRead(ResponseModel):
    id: str
    user_id: int
    label_id: str | None
    name: str
    start_date: dt_date
    end_date: dt_date
    progress: int
    dependencies: str | None
    notes: str | None
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class UserExportSummary(ResponseModel):
    id: int
    username: str
    display_name: str


class UserDataExport(ResponseModel):
    exported_at: dt_datetime
    user: UserExportSummary
    labels: list[LabelSyncRead]
    time_tracking_tasks: list[TaskSyncRead]
    time_tracking_templates: list[TemplateSyncRead]
    work_locations: list[WorkLocationSyncRead]
    gantt_tasks: list[GanttTaskSyncRead]
    time_off_entries: list[TimeOffEntrySyncRead]
    preferences: dict[str, Any]


# Upper bound per entity list in a single push batch.  Generous for real
# outbox flushes (which hold at most a few hundred queued changes) while
# preventing a single request from processing an unbounded batch in one
# transaction.  Clients with more pending changes must split into multiple
# pushes.
MAX_SYNC_PUSH_ITEMS = 1000


class SyncPushRequest(RequestModel):
    """Batched push of local changes from client to server."""

    # Opt-in acknowledgement that this batch is *meant* to remove a large share
    # of the account's data (the first-sync "keep local data" replace is the
    # only flow that legitimately does so, and only after the user confirms it
    # in a dialog).  Left false, ``push_changes`` refuses batches that would
    # tombstone most of the account — see BULK_DELETE_* in
    # ``app/services/sync_service.py``.  A client bug that pushes an empty
    # local snapshot as the new truth is by far the most damaging thing this
    # endpoint can be asked to do, and it is indistinguishable from a genuine
    # replace without this flag.
    allow_bulk_delete: bool = False

    # Total number of delete actions in the *logical* push this request is part
    # of. Clients split an oversized payload into several requests, and each is
    # its own transaction, so a per-request guard sees only its own slice: 1500
    # deletes chunked as 1000 + 500 lets the first chunk through (1000 of 1500
    # active is under the fraction) and only refuses the second, leaving the
    # account two-thirds erased. No per-request rule can catch that first chunk
    # — on its own information it is an ordinary partial delete — so the client
    # states the total up front and every chunk is judged against it.
    #
    # Advisory, and deliberately so: it can only make the guard stricter, and
    # the thing being guarded against is our own client pushing an empty local
    # snapshot as truth. Such a client computes deletes for every server row,
    # so it declares the real total and is refused on the first chunk.
    declared_delete_total: int | None = Field(default=None, ge=0)

    labels: list[LabelSyncItem] = Field(default_factory=list, max_length=MAX_SYNC_PUSH_ITEMS)
    tasks: list[TaskSyncItem] = Field(default_factory=list, max_length=MAX_SYNC_PUSH_ITEMS)
    templates: list[TemplateSyncItem] = Field(default_factory=list, max_length=MAX_SYNC_PUSH_ITEMS)
    work_locations: list[WorkLocationSyncItem] = Field(default_factory=list, max_length=MAX_SYNC_PUSH_ITEMS)
    time_off_entries: list[TimeOffEntrySyncItem] = Field(default_factory=list, max_length=MAX_SYNC_PUSH_ITEMS)
    gantt_tasks: list[GanttTaskSyncItem] = Field(default_factory=list, max_length=MAX_SYNC_PUSH_ITEMS)


class SyncPushResults(ResponseModel):
    """The six entity collections always returned by a sync push, including empty ones."""

    labels: list[SyncRecordResult]
    tasks: list[TaskSyncRecordResult]
    templates: list[SyncRecordResult]
    work_locations: list[SyncRecordResult]
    time_off_entries: list[SyncRecordResult]
    gantt_tasks: list[SyncRecordResult]


class SyncPushResponse(ResponseModel):
    """Per-record results for a sync push batch."""

    results: SyncPushResults


class SyncPullResponse(ResponseModel):
    """All records (including soft-deleted) modified since a given timestamp."""

    labels: list[LabelSyncRead]
    tasks: list[TaskSyncRead]
    templates: list[TemplateSyncRead]
    work_locations: list[WorkLocationSyncRead]
    time_off_entries: list[TimeOffEntrySyncRead]
    gantt_tasks: list[GanttTaskSyncRead]
    server_timestamp: dt_datetime


class SyncStatusResponse(ResponseModel):
    """Latest modification timestamps per entity type for the authenticated user."""

    labels_updated_at: dt_datetime | None
    tasks_updated_at: dt_datetime | None
    templates_updated_at: dt_datetime | None
    work_locations_updated_at: dt_datetime | None
    time_off_entries_updated_at: dt_datetime | None
    gantt_tasks_updated_at: dt_datetime | None
    preferences_updated_at: dt_datetime | None
    server_timestamp: dt_datetime
