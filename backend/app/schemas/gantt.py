"""Gantt task schemas."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime

from pydantic import Field, model_validator

from app.schemas.base import ListResponse, RequestModel, ResponseModel


class GanttTaskCreate(RequestModel):
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


class GanttTaskRead(ResponseModel):
    id: str
    label_id: str | None
    name: str
    start_date: dt_date
    end_date: dt_date
    progress: int
    dependencies: str | None
    notes: str | None
    created_at: dt_datetime
    updated_at: dt_datetime


class LegacyGanttTaskRead(GanttTaskRead):
    user_id: int = Field(deprecated=True)


class GanttTaskUpdate(RequestModel):
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
