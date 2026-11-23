"""Time-tracking task schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Annotated

from pydantic import Field, field_validator
from pydantic.json_schema import SkipJsonSchema

from app.schemas.base import ListResponse, RequestModel, ResponseModel


class TaskCreate(RequestModel):
    text: str
    label_id: str = Field(min_length=1, pattern=r"\S")
    gantt_task_id: str | None = None
    start_time: dt_datetime
    stop_time: dt_datetime | None = None
    includes_break: bool = False


class TaskRead(ResponseModel):
    id: str
    user_id: int = Field(deprecated=True)
    label_id: str | None
    gantt_task_id: str | None
    text: str
    start_time: dt_datetime
    stop_time: dt_datetime | None
    includes_break: bool
    created_at: dt_datetime
    updated_at: dt_datetime


class TaskUpdate(RequestModel):
    label_id: Annotated[str, Field(min_length=1, pattern=r"\S")] | SkipJsonSchema[None] = None
    gantt_task_id: str | None = None
    text: str | None = None
    start_time: dt_datetime | None = None
    stop_time: dt_datetime | None = None
    includes_break: bool | None = None

    @field_validator("label_id")
    @classmethod
    def require_label(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("A label is required")
        return value


class TaskListResponse(ListResponse[TaskRead]):
    pass
