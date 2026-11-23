"""Time-tracking template schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from datetime import time as dt_time
from typing import Annotated

from pydantic import Field, field_validator
from pydantic.json_schema import SkipJsonSchema

from app.schemas.base import ListResponse, RequestModel, ResponseModel


class TemplateCreate(RequestModel):
    text: str
    label_id: str = Field(min_length=1, pattern=r"\S")
    start_time: dt_time
    stop_time: dt_time


class TemplateRead(ResponseModel):
    id: str
    user_id: int = Field(deprecated=True)
    label_id: str | None
    text: str
    start_time: dt_time
    stop_time: dt_time
    created_at: dt_datetime
    updated_at: dt_datetime


class TemplateUpdate(RequestModel):
    text: str | None = None
    label_id: Annotated[str, Field(min_length=1, pattern=r"\S")] | SkipJsonSchema[None] = None
    start_time: dt_time | None = None
    stop_time: dt_time | None = None

    @field_validator("label_id")
    @classmethod
    def require_label(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("A label is required")
        return value


class TemplateListResponse(ListResponse[TemplateRead]):
    pass
