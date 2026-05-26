"""Reusable read models for mobile and other read-only clients."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from typing import Literal

from pydantic import BaseModel

ScheduleType = Literal["9-5", "2-shift", "weekend-shift", "5-shift"]
ReadModelState = Literal["ready", "missing_work_context"]


class ReadModelIdentity(BaseModel):
    """Authenticated user identity exposed to read-only clients."""

    id: int
    username: str
    display_name: str
    is_admin: bool


class ReadModelFeatureFlags(BaseModel):
    """Feature flags relevant to read-only companion clients."""

    time_off_enabled: bool


class ReadModelWorkContext(BaseModel):
    """Persisted work context derived from synced user preferences."""

    schedule_type: ScheduleType | None
    team_number: int | None
    effective_team_number: int | None
    state: ReadModelState
    feature_flags: ReadModelFeatureFlags


class ReadModelShift(BaseModel):
    """Stable shift description used across multiple read models."""

    code: str
    display_code: str
    name: str
    start_hour: float | None
    end_hour: float | None
    is_working: bool


class OffDayProgressReadModel(BaseModel):
    """Progress through the current off-day block."""

    current: int
    total: int


class TeamShiftStatusReadModel(BaseModel):
    """Shift status for a single team."""

    team_number: int
    date: dt_date
    shift_day: dt_date
    shift_code: str
    shift: ReadModelShift
    is_currently_working: bool


class CurrentStatusReadModel(BaseModel):
    """Current shift status for the authenticated user's work context."""

    as_of: dt_datetime
    current_shift: TeamShiftStatusReadModel | None
    currently_working_team: TeamShiftStatusReadModel | None
    off_day_progress: OffDayProgressReadModel | None


class NextShiftItemReadModel(BaseModel):
    """Single upcoming shift entry."""

    team_number: int
    date: dt_date
    shift_code: str
    shift: ReadModelShift


class NextShiftsReadModel(BaseModel):
    """Ordered upcoming shifts for the authenticated user's team."""

    as_of: dt_datetime
    items: list[NextShiftItemReadModel]


class TeamStatusReadModel(BaseModel):
    """Current or nearby team status for all teams in the schedule."""

    as_of: dt_datetime
    items: list[TeamShiftStatusReadModel]


class TimeOffSummaryItemReadModel(BaseModel):
    """Upcoming or active time-off occurrence."""

    entry_id: str
    entry_kind: str
    entry_type: str
    entry_flag: str
    note: str | None
    starts_on: dt_date
    ends_on: dt_date
    is_recurring_weekly: bool
    is_active: bool


class TimeOffSummaryReadModel(BaseModel):
    """Upcoming and active time-off summary."""

    as_of: dt_datetime
    active_items: list[TimeOffSummaryItemReadModel]
    upcoming_items: list[TimeOffSummaryItemReadModel]
    total_upcoming: int


class DashboardReadModel(BaseModel):
    """Aggregated reusable read models for companion clients."""

    as_of: dt_datetime
    identity: ReadModelIdentity
    work_context: ReadModelWorkContext
    current_status: CurrentStatusReadModel
    next_shifts: NextShiftsReadModel
    team_status: TeamStatusReadModel
    time_off_summary: TimeOffSummaryReadModel
