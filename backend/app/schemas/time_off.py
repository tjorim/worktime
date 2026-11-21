"""Time-off entry schemas."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from typing import Literal

from pydantic import model_validator

from app.schemas.base import ListResponse, NonEmptyText, RequestModel, ResponseModel

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


class TimeOffEntryCreate(RequestModel):
    """Request schema for creating or upserting a time-off entry."""

    entry_id: NonEmptyText | None = None
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


class TimeOffEntryRead(ResponseModel):
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


class TimeOffEntryUpdate(RequestModel):
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
