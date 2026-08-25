"""Pydantic request/response schemas for database-backed resources."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from datetime import time as dt_time
from typing import Annotated, Any, Literal, cast
from urllib.parse import urlparse

import pycountry
from pydantic import BaseModel, Field, field_validator, model_validator

from app.utils.datetime import ensure_utc

ISO_ALPHA2_CODES = frozenset(country.alpha_2 for country in pycountry.countries)


class ListResponse[T](BaseModel):
    """Generic paged list response."""

    items: list[T]
    total: int


class UserRegister(BaseModel):
    """Payload for the admin-only pre-registration endpoint.

    ``display_name`` is optional; it defaults to the username when omitted.
    Authentication is handled by the OIDC provider; no password is stored locally.

    The username pattern mirrors what OIDC auto-provisioning derives from
    ``preferred_username``/email claims: it must start with a letter or digit
    and may contain letters, digits, and ``. _ @ + -`` (no whitespace or
    control characters).
    """

    username: str = Field(
        min_length=1,
        max_length=150,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._@+-]*$",
    )
    display_name: str | None = None


class UserCreate(BaseModel):
    username: str
    display_name: str
    settings: dict[str, Any] = Field(default_factory=dict)


class UserRead(BaseModel):
    id: int
    username: str
    display_name: str
    settings: dict[str, Any]
    created_at: dt_datetime
    updated_at: dt_datetime


class UserUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    settings: dict[str, Any] | None = None


class AccountCapabilities(BaseModel):
    """Capability flags relevant for frontend feature enablement."""

    backup_enabled: bool


class AccountProfile(BaseModel):
    """Response schema for the authenticated account profile endpoint."""

    id: int
    username: str
    display_name: str
    is_admin: bool
    capabilities: AccountCapabilities


class OidcDiscoveryConfig(BaseModel):
    """Public OIDC endpoints discovered by native clients from the API."""

    issuer: str
    authorization_url: str
    token_url: str
    end_session_url: str | None = None


def _validate_hex_color(value: str | None) -> str | None:
    """Validate that a color value is in #RRGGBB hex format."""
    if value is None:
        return None
    if not value.startswith("#") or len(value) != 7:
        raise ValueError("color must be in #RRGGBB format")
    try:
        int(value[1:], 16)
    except ValueError as error:
        raise ValueError("color must be in #RRGGBB format") from error
    return value.upper()


class LabelCreate(BaseModel):
    name: str
    color: str

    @field_validator("color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        result = _validate_hex_color(value)
        if result is None:
            raise ValueError("color must be in #RRGGBB format")
        return result


class LabelRead(BaseModel):
    id: str
    user_id: int
    name: str
    color: str
    created_at: dt_datetime


class LabelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

    @field_validator("color")
    @classmethod
    def validate_hex_color(cls, value: str | None) -> str | None:
        return _validate_hex_color(value)


class TaskCreate(BaseModel):
    text: str
    label_id: str | None = None
    gantt_task_id: str | None = None
    start_time: dt_datetime
    stop_time: dt_datetime | None = None
    includes_break: bool = False

    @field_validator("start_time", "stop_time", mode="after")
    @classmethod
    def normalize_datetime_tz(cls, value: dt_datetime | None) -> dt_datetime | None:
        return ensure_utc(value)


class TaskRead(BaseModel):
    id: str
    user_id: int
    label_id: str | None
    gantt_task_id: str | None
    text: str
    start_time: dt_datetime
    stop_time: dt_datetime | None
    includes_break: bool
    created_at: dt_datetime


class TaskUpdate(BaseModel):
    label_id: str | None = None
    gantt_task_id: str | None = None
    text: str | None = None
    start_time: dt_datetime | None = None
    stop_time: dt_datetime | None = None
    includes_break: bool | None = None

    @field_validator("start_time", "stop_time", mode="after")
    @classmethod
    def normalize_datetime_tz(cls, value: dt_datetime | None) -> dt_datetime | None:
        return ensure_utc(value)


class TemplateCreate(BaseModel):
    text: str
    label_id: str | None = None
    start_time: dt_time
    stop_time: dt_time


class TemplateRead(BaseModel):
    id: str
    user_id: int
    label_id: str | None
    text: str
    start_time: dt_time
    stop_time: dt_time
    created_at: dt_datetime


class TemplateUpdate(BaseModel):
    text: str | None = None
    label_id: str | None = None
    start_time: dt_time | None = None
    stop_time: dt_time | None = None


class WorkLocationCreate(BaseModel):
    date: dt_date
    country_code: str
    label: str | None = None

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in ISO_ALPHA2_CODES:
            raise ValueError("country_code must be ISO alpha-2")
        return normalized


class WorkLocationRead(BaseModel):
    id: int
    user_id: int
    date: dt_date
    country_code: str
    label: str | None
    created_at: dt_datetime


class WorkLocationUpdate(BaseModel):
    country_code: str | None = None
    label: str | None = None

    _validate_country_code = field_validator("country_code")(WorkLocationCreate.validate_country_code)


AccessTokenScope = Literal["pebble:read", "pebble:write"]


class IcalFeedCreated(BaseModel):
    """New calendar subscription credential; the URL is only returned on rotation."""

    url_path: str


class IcalFeedStatus(BaseModel):
    """Whether the user currently has an active calendar subscription."""

    configured: bool
    token_preview: str | None = None
    created_at: dt_datetime | None = None
    last_used_at: dt_datetime | None = None


class AccessTokenCreate(BaseModel):
    """Payload for minting a new personal access token."""

    name: str = Field(min_length=1, max_length=100)
    scopes: list[AccessTokenScope] = ["pebble:read"]

    @field_validator("scopes")
    @classmethod
    def deduplicate_scopes(cls, value: list[AccessTokenScope]) -> list[AccessTokenScope]:
        if not value:
            raise ValueError("at least one scope is required")
        return list(dict.fromkeys(value))


class AccessTokenCreated(BaseModel):
    """Response returned once, at creation time, including the raw token value."""

    id: str
    name: str
    token: str
    scopes: list[AccessTokenScope]
    created_at: dt_datetime


class AccessTokenRead(BaseModel):
    """A previously issued token, without its raw secret value."""

    id: str
    name: str
    token_preview: str
    scopes: list[AccessTokenScope]
    created_at: dt_datetime
    last_used_at: dt_datetime | None


class AccessTokenListResponse(ListResponse[AccessTokenRead]):
    pass


class PushSubscriptionKeys(BaseModel):
    """The two keys the browser's PushManager returns alongside the endpoint."""

    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


# The backend later issues an authenticated server-side HTTP request straight to
# this URL (pywebpush's webpush() call in push_service.py) using the caller-supplied
# value verbatim. Without an allowlist, an authenticated user could register an
# internal/loopback/link-local address as their "push endpoint" and get the backend
# to make requests to it on their behalf (SSRF) roughly once a minute. Real browser
# PushManager subscriptions only ever come from this small, stable set of push
# services, so restricting to known hosts costs nothing for legitimate use.
_ALLOWED_PUSH_ENDPOINT_HOSTS = frozenset(
    {
        "fcm.googleapis.com",  # Chrome, Edge, Firefox for Android, most Chromium browsers
        "updates.push.services.mozilla.com",  # Firefox desktop
        "web.push.apple.com",  # Safari (macOS/iOS 16.4+)
    }
)
_ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = (".notify.windows.com",)  # Edge/Windows (WNS)


def _is_allowed_push_endpoint_host(hostname: str) -> bool:
    hostname = hostname.lower()
    return hostname in _ALLOWED_PUSH_ENDPOINT_HOSTS or hostname.endswith(_ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES)


class PushSubscriptionCreate(BaseModel):
    """Payload for registering (or updating, by re-posting) a browser's push subscription."""

    endpoint: str = Field(min_length=1, max_length=2048)
    keys: PushSubscriptionKeys
    timezone: str = "UTC"

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or not _is_allowed_push_endpoint_host(parsed.hostname):
            raise ValueError("endpoint must be a known browser push service URL")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown timezone: {value!r}") from exc
        return value


class PushSubscriptionRead(BaseModel):
    """A registered push subscription, without its auth secret."""

    id: str
    endpoint: str
    timezone: str
    created_at: dt_datetime
    updated_at: dt_datetime


IntegrationClientScope = Literal["worktime:mcp", "worktime:admin"]


class IntegrationClientCreate(BaseModel):
    """Payload for provisioning a new managed integration client (issue #1054).

    ``worktime:admin`` is a deliberate, explicit grant — never implied by
    ``worktime:mcp`` — matching Worktime's existing ``is_admin`` semantics.
    Only an admin caller may request it; see
    app.routers.integration_clients.create_integration_client_endpoint.
    """

    name: str = Field(min_length=1, max_length=120)
    scopes: list[IntegrationClientScope] = Field(
        default_factory=lambda: cast(list[IntegrationClientScope], ["worktime:mcp"])
    )
    rate_limit_per_minute: int = Field(default=120, ge=1, le=6000)

    @field_validator("scopes")
    @classmethod
    def deduplicate_scopes(cls, value: list[IntegrationClientScope]) -> list[IntegrationClientScope]:
        if not value:
            raise ValueError("at least one scope is required")
        return list(dict.fromkeys(value))


class IntegrationClientCreated(BaseModel):
    """Response returned once, at creation/rotation time, including the raw key value."""

    id: int
    name: str
    key: str
    scopes: list[IntegrationClientScope]
    rate_limit_per_minute: int
    created_at: dt_datetime


class IntegrationClientRead(BaseModel):
    """A previously issued integration client, without its raw key."""

    id: int
    name: str
    key_preview: str
    scopes: list[IntegrationClientScope]
    rate_limit_per_minute: int
    is_active: bool
    created_at: dt_datetime
    last_used_at: dt_datetime | None
    revoked_at: dt_datetime | None


class IntegrationClientListResponse(ListResponse[IntegrationClientRead]):
    pass


class AuditEntryRead(BaseModel):
    """A single transactional audit-trail entry (issue #1054)."""

    id: int
    actor_user_id: int | None
    actor_label: str
    subject: str | None
    auth_source: str
    action: str
    resource_type: str
    resource_id: str
    request_id: str | None
    details: dict[str, Any]
    created_at: dt_datetime


class AuditEntryListResponse(ListResponse[AuditEntryRead]):
    pass


class TaskListResponse(ListResponse[TaskRead]):
    pass


class LabelListResponse(ListResponse[LabelRead]):
    pass


class TemplateListResponse(ListResponse[TemplateRead]):
    pass


class UserListResponse(ListResponse[UserRead]):
    pass


class WorkLocationListResponse(ListResponse[WorkLocationRead]):
    pass


class GanttTaskCreate(BaseModel):
    name: str
    label_id: str | None = None
    start_date: dt_date
    end_date: dt_date
    progress: int = Field(default=0, ge=0, le=100)
    dependencies: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> GanttTaskCreate:
        if self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class GanttTaskRead(BaseModel):
    id: str
    user_id: int
    label_id: str | None
    name: str
    start_date: dt_date
    end_date: dt_date
    progress: int
    dependencies: str | None
    notes: str | None
    created_at: dt_datetime


class GanttTaskUpdate(BaseModel):
    name: str | None = None
    label_id: str | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    dependencies: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> GanttTaskUpdate:
        if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class GanttTaskListResponse(ListResponse[GanttTaskRead]):
    pass


# ---------------------------------------------------------------------------
# User Preferences schemas
# ---------------------------------------------------------------------------


class UserPreferencesRead(BaseModel):
    """Response schema for the authenticated user's preferences blob."""

    user_id: int
    data: dict[str, Any]
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime


class UserPreferencesWrite(BaseModel):
    """Request schema for writing the authenticated user's preferences blob.

    ``client_updated_at`` is the client-side timestamp of the local state being
    pushed, used for last-write-wins conflict detection.
    ``data`` is the full preferences JSON object (opaque to the server).
    """

    data: dict[str, Any]
    client_updated_at: dt_datetime


# ---------------------------------------------------------------------------
# Time-off entry schemas
# ---------------------------------------------------------------------------

EntryType = Literal[
    "vacation",
    "business",
    "course",
    "in",
    "weekend",
    "birthday",
    "ill",
    "other",
]

EntryKind = Literal["date", "range", "weekly"]
EntryFlag = Literal["full_day", "half_am", "half_pm", "onsite", "no_fly", "can_fly"]


class TimeOffEntryCreate(BaseModel):
    """Request schema for creating or upserting a time-off entry."""

    entry_id: str | None = Field(default=None, min_length=1)
    entry_kind: EntryKind = "date"
    date: dt_date | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None
    weekday: int | None = None
    entry_type: EntryType = "vacation"
    entry_flag: EntryFlag = "full_day"
    note: str | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> TimeOffEntryCreate:
        if self.entry_kind == "date":
            if self.date is None:
                raise ValueError("date is required for date entries")
            if self.start_date is not None or self.end_date is not None or self.weekday is not None:
                raise ValueError("date entries cannot include range or weekday fields")
        elif self.entry_kind == "range":
            if self.start_date is None or self.end_date is None:
                raise ValueError("start_date and end_date are required for range entries")
            if self.end_date <= self.start_date:
                raise ValueError("end_date must be after start_date; use entry_kind='date' for single-day entries")
            if self.date is not None or self.weekday is not None:
                raise ValueError("range entries cannot include date or weekday fields")
        elif self.entry_kind == "weekly":
            if self.weekday is None or self.weekday < 1 or self.weekday > 7:
                raise ValueError("weekday must be between 1 and 7 for weekly entries")
            if self.date is not None or self.start_date is not None or self.end_date is not None:
                raise ValueError("weekly entries cannot include date or range fields")
        return self


class TimeOffEntryRead(BaseModel):
    """Response schema for a single time-off entry (REST endpoints).

    ``client_updated_at`` is intentionally excluded here — it is only surfaced
    via ``TimeOffEntrySyncRead`` on the sync endpoints, which is the intended
    access path for conflict-resolution metadata.
    """

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
    created_at: dt_datetime
    updated_at: dt_datetime


class TimeOffEntryUpdate(BaseModel):
    entry_kind: EntryKind | None = None
    date: dt_date | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None
    weekday: int | None = None
    entry_type: EntryType | None = None
    entry_flag: EntryFlag | None = None
    note: str | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> TimeOffEntryUpdate:
        shape_fields_set = self.model_fields_set & {"date", "start_date", "end_date", "weekday"}
        if shape_fields_set and self.entry_kind is None:
            raise ValueError("entry_kind must be provided when updating date, start_date, end_date, or weekday fields")
        if self.entry_kind is None:
            return self

        if self.entry_kind == "date":
            if self.date is None:
                raise ValueError("date is required when entry_kind is date")
            if self.model_fields_set & {"start_date", "end_date", "weekday"}:
                raise ValueError("start_date, end_date, and weekday are not allowed when entry_kind is date")
        elif self.entry_kind == "range":
            if self.start_date is None or self.end_date is None:
                raise ValueError("start_date and end_date are required when entry_kind is range")
            if self.end_date <= self.start_date:
                raise ValueError("end_date must be after start_date; use entry_kind='date' for single-day entries")
            if self.model_fields_set & {"date", "weekday"}:
                raise ValueError("date and weekday are not allowed when entry_kind is range")
        elif self.entry_kind == "weekly":
            if self.weekday is None or self.weekday < 1 or self.weekday > 7:
                raise ValueError("weekday must be provided when entry_kind is weekly")
            if self.model_fields_set & {"date", "start_date", "end_date"}:
                raise ValueError("date, start_date, and end_date are not allowed when entry_kind is weekly")
        return self


class TimeOffEntryListResponse(ListResponse[TimeOffEntryRead]):
    pass


# ---------------------------------------------------------------------------
# Sync schemas
# ---------------------------------------------------------------------------


class SyncRecordResult(BaseModel):
    """Result for a single record in a sync push batch."""

    id: str
    status: Literal["ok", "conflict"]
    server_updated_at: dt_datetime | None = None
    conflict_reason: str | None = None


# Sync read schemas — include updated_at and deleted_at for pull responses.


class LabelSyncRead(BaseModel):
    id: str
    user_id: int
    name: str
    color: str
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class TaskSyncRead(BaseModel):
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


class TemplateSyncRead(BaseModel):
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


class WorkLocationSyncRead(BaseModel):
    id: int
    user_id: int
    date: dt_date
    country_code: str
    label: str | None
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class TimeOffEntrySyncRead(BaseModel):
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


# Sync push request item schemas — one per entity type.
# For 'create'/'update' actions the entity fields are required in practice;
# for 'delete' only the identity field is strictly needed.


class LabelSyncItem(BaseModel):
    id: str
    action: Literal["create", "update", "delete"]
    client_updated_at: dt_datetime
    name: str | None = None
    color: str | None = None


class TaskSyncItem(BaseModel):
    id: str
    action: Literal["create", "update", "delete"]
    client_updated_at: dt_datetime
    label_id: str | None = None
    gantt_task_id: str | None = None
    text: str | None = None
    start_time: dt_datetime | None = None
    stop_time: dt_datetime | None = None
    includes_break: bool | None = None


class TemplateSyncItem(BaseModel):
    id: str
    action: Literal["create", "update", "delete"]
    client_updated_at: dt_datetime
    label_id: str | None = None
    text: str | None = None
    start_time: dt_time | None = None
    stop_time: dt_time | None = None


class WorkLocationSyncItem(BaseModel):
    """Work locations are identified by date (natural key) rather than an integer PK."""

    date: dt_date
    action: Literal["create", "update", "delete"]
    client_updated_at: dt_datetime
    country_code: str | None = None
    label: str | None = None


class TimeOffEntrySyncItemBase(BaseModel):
    """Time-off entries are identified by a stable client-generated entry id."""

    id: str = Field(min_length=1)
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


class GanttTaskSyncItem(BaseModel):
    id: str
    action: Literal["create", "update", "delete"]
    client_updated_at: dt_datetime
    name: str | None = None
    label_id: str | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    dependencies: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_create_fields(self) -> GanttTaskSyncItem:
        if self.action == "create":
            missing = [f for f in ("name", "start_date", "end_date") if getattr(self, f) is None]
            if missing:
                raise ValueError(f"Fields required for action 'create': {', '.join(missing)}")
        # Only catches the create case, since start_date/end_date may each be
        # provided independently on a partial update — _push_gantt_task
        # re-checks the merged candidate dates for that case.
        if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class GanttTaskSyncRead(BaseModel):
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


class UserExportSummary(BaseModel):
    id: int
    username: str
    display_name: str


class UserDataExport(BaseModel):
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


class SyncPushRequest(BaseModel):
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


class SyncPushResponse(BaseModel):
    """Per-record results for a sync push batch."""

    results: dict[str, list[SyncRecordResult]]


class SyncPullResponse(BaseModel):
    """All records (including soft-deleted) modified since a given timestamp."""

    labels: list[LabelSyncRead]
    tasks: list[TaskSyncRead]
    templates: list[TemplateSyncRead]
    work_locations: list[WorkLocationSyncRead]
    time_off_entries: list[TimeOffEntrySyncRead]
    gantt_tasks: list[GanttTaskSyncRead]
    server_timestamp: dt_datetime


class SyncStatusResponse(BaseModel):
    """Latest modification timestamps per entity type for the authenticated user."""

    labels_updated_at: dt_datetime | None
    tasks_updated_at: dt_datetime | None
    templates_updated_at: dt_datetime | None
    work_locations_updated_at: dt_datetime | None
    time_off_entries_updated_at: dt_datetime | None
    gantt_tasks_updated_at: dt_datetime | None
    preferences_updated_at: dt_datetime | None
    server_timestamp: dt_datetime
