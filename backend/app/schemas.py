"""Pydantic request/response schemas for database-backed resources."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from datetime import time as dt_time
from typing import Any, Literal

import pycountry
from pydantic import BaseModel, Field, field_validator, model_validator

ISO_ALPHA2_CODES = frozenset(country.alpha_2 for country in pycountry.countries)




class ListResponse[T](BaseModel):
    """Generic paged list response."""

    items: list[T]
    total: int


class UserCreate(BaseModel):
    username: str
    display_name: str
    settings: dict[str, Any] = Field(default_factory=dict)
    password: str = Field(min_length=8)


class UserRead(BaseModel):
    id: int
    username: str
    display_name: str
    settings: dict[str, Any]
    created_at: dt_datetime
    updated_at: dt_datetime


class UserUpdate(BaseModel):
    display_name: str | None = None
    settings: dict[str, Any] | None = None


class LabelCreate(BaseModel):
    name: str
    color: str

    @field_validator("color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        if not value.startswith("#") or len(value) != 7:
            raise ValueError("color must be in #RRGGBB format")
        try:
            int(value[1:], 16)
        except ValueError as error:
            raise ValueError("color must be in #RRGGBB format") from error
        return value.upper()


class LabelRead(BaseModel):
    id: str
    user_id: int
    name: str
    color: str
    created_at: dt_datetime


class LabelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

    _validate_hex_color = field_validator("color")(LabelCreate.validate_hex_color)


class TaskCreate(BaseModel):
    text: str
    label_id: str | None = None
    start_time: dt_datetime
    stop_time: dt_datetime | None = None
    includes_break: bool = False


class TaskRead(BaseModel):
    id: str
    user_id: int
    label_id: str | None
    text: str
    start_time: dt_datetime
    stop_time: dt_datetime | None
    includes_break: bool
    created_at: dt_datetime


class TaskUpdate(BaseModel):
    label_id: str | None = None
    text: str | None = None
    start_time: dt_datetime | None = None
    stop_time: dt_datetime | None = None
    includes_break: bool | None = None


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

    _validate_country_code = field_validator("country_code")(
        WorkLocationCreate.validate_country_code
    )


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


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
    name: str
    start_date: dt_date
    end_date: dt_date
    progress: int
    dependencies: str | None
    notes: str | None
    created_at: dt_datetime


class GanttTaskUpdate(BaseModel):
    name: str | None = None
    start_date: dt_date | None = None
    end_date: dt_date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    dependencies: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> GanttTaskUpdate:
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class GanttTaskListResponse(ListResponse[GanttTaskRead]):
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
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class TaskSyncRead(BaseModel):
    id: str
    user_id: int
    label_id: str | None
    text: str
    start_time: dt_datetime
    stop_time: dt_datetime | None
    includes_break: bool
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
    created_at: dt_datetime
    updated_at: dt_datetime
    deleted_at: dt_datetime | None


class WorkLocationSyncRead(BaseModel):
    id: int
    user_id: int
    date: dt_date
    country_code: str
    label: str | None
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


class SyncPushRequest(BaseModel):
    """Batched push of local changes from client to server."""

    labels: list[LabelSyncItem] = []
    tasks: list[TaskSyncItem] = []
    templates: list[TemplateSyncItem] = []
    work_locations: list[WorkLocationSyncItem] = []


class SyncPushResponse(BaseModel):
    """Per-record results for a sync push batch."""

    results: dict[str, list[SyncRecordResult]]


class SyncPullResponse(BaseModel):
    """All records (including soft-deleted) modified since a given timestamp."""

    labels: list[LabelSyncRead]
    tasks: list[TaskSyncRead]
    templates: list[TemplateSyncRead]
    work_locations: list[WorkLocationSyncRead]
    server_timestamp: dt_datetime


class SyncStatusResponse(BaseModel):
    """Latest modification timestamps per entity type for the authenticated user."""

    labels_updated_at: dt_datetime | None
    tasks_updated_at: dt_datetime | None
    templates_updated_at: dt_datetime | None
    work_locations_updated_at: dt_datetime | None
    server_timestamp: dt_datetime
