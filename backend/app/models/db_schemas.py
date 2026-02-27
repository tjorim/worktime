"""Pydantic request/response schemas for database-backed resources."""

from __future__ import annotations

from datetime import date as dt_date, datetime as dt_datetime, time as dt_time
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field, field_validator

T = TypeVar("T")


class ListResponse(BaseModel, Generic[T]):
    """Generic paged list response."""

    items: list[T]
    total: int


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
    display_name: str | None = None
    settings: dict[str, Any] | None = None


class LabelCreate(BaseModel):
    name: str
    color: str

    @field_validator("color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        if len(value) != 7 or not value.startswith("#"):
            raise ValueError("color must be in #RRGGBB format")
        hex_part = value[1:]
        if not all(ch in "0123456789abcdefABCDEF" for ch in hex_part):
            raise ValueError("color must be in #RRGGBB format")
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
        if len(value) != 2 or not value.isalpha():
            raise ValueError("country_code must be ISO alpha-2")
        return value.upper()


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
