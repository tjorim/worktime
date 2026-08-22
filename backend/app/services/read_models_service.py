"""Builders for reusable authenticated read models."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, timedelta
from datetime import date as dt_date
from datetime import datetime as dt_datetime
from math import floor
from typing import Any, cast
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import TimeOffEntry
from app.read_models import (
    CurrentStatusReadModel,
    DashboardReadModel,
    NextShiftItemReadModel,
    NextShiftsReadModel,
    OffDayProgressReadModel,
    ReadModelFeatureFlags,
    ReadModelIdentity,
    ReadModelShift,
    ReadModelState,
    ReadModelWorkContext,
    ScheduleType,
    TeamShiftStatusReadModel,
    TeamStatusReadModel,
    TimeOffSummaryItemReadModel,
    TimeOffSummaryReadModel,
)
from app.routers.auth import AuthenticatedPrincipal
from app.services.db_service import (
    get_user,
    get_user_preferences,
    list_time_off_entries,
)
from app.utils.datetime import as_utc


@dataclass(frozen=True)
class _ShiftDefinition:
    """Backend copy of the frontend's ShiftTimeDefinition (rosters.ts), minus
    the flex-time fields (flexStartEarliest/flexStartLatest/presenceHours).

    Those are a UI affordance for the Current Status card's finish-time
    countdown, not something Pebble/MCP read-only clients act on — so
    ReadModelShift only ever carries the flat start/end window. If a
    consumer needs the flex window, add the fields here and to
    ReadModelShift/_to_shift_model rather than approximating it from start/end.
    """

    name: str
    start: float | None
    end: float | None
    display_code: str


@dataclass(frozen=True)
class _ScheduleConfig:
    team_count: int
    cycle_length_days: int
    reference_date: dt_date
    schedule_pattern: tuple[str, ...]
    shift_times: dict[str, _ShiftDefinition]


@dataclass(frozen=True)
class _ResolvedShift:
    code: str
    display_code: str
    name: str
    start_hour: float | None
    end_hour: float | None
    is_working: bool


_OFF_SHIFT = _ShiftDefinition(name="Off", start=None, end=None, display_code="O")

# Hand-copied from frontend/src/data/rosters.ts (the source of truth per
# AGENTS.md) because the frontend and backend build/deploy independently and
# neither serves its roster config to the other at runtime (see #1107 for why
# that tradeoff was made). tests/test_roster_golden_fixture.py cross-checks
# this dict, and the algorithms below it, against a fixture generated from
# rosters.ts/shiftCalculations.ts — after editing a schedule here, also edit
# rosters.ts and run "pnpm run generate-roster-fixture" in frontend/.
_SCHEDULES: dict[ScheduleType, _ScheduleConfig] = {
    "9-5": _ScheduleConfig(
        team_count=1,
        cycle_length_days=7,
        reference_date=dt_date(2025, 1, 6),
        schedule_pattern=("D", "D", "D", "D", "D", "O", "O"),
        shift_times={
            "D": _ShiftDefinition(name="Day", start=9.0, end=17.0, display_code="D"),
            "O": _OFF_SHIFT,
        },
    ),
    "2-shift": _ScheduleConfig(
        team_count=4,
        cycle_length_days=28,
        reference_date=dt_date(2025, 7, 14),
        schedule_pattern=(
            "M",
            "M",
            "M",
            "M",
            "M",
            "D",
            "D",
            "L",
            "L",
            "L",
            "L",
            "L",
            "O",
            "O",
            "M",
            "M",
            "M",
            "M",
            "M",
            "O",
            "O",
            "L",
            "L",
            "L",
            "L",
            "L",
            "O",
            "O",
        ),
        shift_times={
            "M": _ShiftDefinition(name="Morning", start=6.5, end=15.5, display_code="M"),
            "L": _ShiftDefinition(name="Evening", start=15.0, end=24.0, display_code="E"),
            "D": _ShiftDefinition(name="Day", start=7.0, end=16.0, display_code="D"),
            "O": _OFF_SHIFT,
        },
    ),
    "weekend-shift": _ScheduleConfig(
        team_count=2,
        cycle_length_days=14,
        reference_date=dt_date(2025, 1, 6),
        schedule_pattern=("O", "O", "O", "O", "D", "M", "M", "O", "O", "O", "O", "D", "L", "L"),
        shift_times={
            "M": _ShiftDefinition(name="Early", start=6.0, end=14.5, display_code="E"),
            "L": _ShiftDefinition(name="Late", start=13.5, end=22.0, display_code="L"),
            "D": _ShiftDefinition(name="Day", start=8.0, end=16.5, display_code="D"),
            "O": _OFF_SHIFT,
        },
    ),
    "5-shift": _ScheduleConfig(
        team_count=5,
        cycle_length_days=10,
        reference_date=dt_date(2025, 7, 16),
        schedule_pattern=("M", "M", "L", "L", "N", "N", "O", "O", "O", "O"),
        shift_times={
            "M": _ShiftDefinition(name="Morning", start=7.0, end=15.0, display_code="M"),
            "L": _ShiftDefinition(name="Evening", start=15.0, end=23.0, display_code="E"),
            "N": _ShiftDefinition(name="Night", start=23.0, end=7.0, display_code="N"),
            "O": _OFF_SHIFT,
        },
    ),
}


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _resolve_schedule_type(raw_value: Any) -> ScheduleType | None:
    if isinstance(raw_value, str) and raw_value in _SCHEDULES:
        return cast(ScheduleType, raw_value)
    return None


def _decimal_hour(value: dt_datetime) -> float:
    return value.hour + value.minute / 60 + value.second / 3600


def _format_yywwd(value: dt_date) -> str:
    iso = value.isocalendar()
    return f"{iso.year % 100:02d}{iso.week:02d}.{iso.weekday}"


def _get_current_shift_day(as_of: dt_datetime, schedule_type: ScheduleType) -> dt_date:
    config = _SCHEDULES[schedule_type]
    night = config.shift_times.get("N")
    if night is None or night.end is None:
        return as_of.date()
    if _decimal_hour(as_of) < night.end:
        return as_of.date() - timedelta(days=1)
    return as_of.date()


def _team_offset_days(schedule_type: ScheduleType, team_number: int) -> int:
    config = _SCHEDULES[schedule_type]
    if config.team_count <= 1 or team_number <= 1:
        return 0
    offset_step = 7 if config.cycle_length_days % 7 == 0 else floor(config.cycle_length_days / config.team_count)
    return (team_number - 1) * offset_step


def _resolve_shift(schedule_type: ScheduleType, team_number: int, target_date: dt_date) -> _ResolvedShift:
    config = _SCHEDULES[schedule_type]
    if team_number < 1 or team_number > config.team_count:
        raise ValueError(f"Invalid team number {team_number} for schedule {schedule_type}")
    days_since_reference = (target_date - config.reference_date).days
    cycle_position = (days_since_reference - _team_offset_days(schedule_type, team_number)) % config.cycle_length_days
    shift_code = config.schedule_pattern[cycle_position]
    shift = config.shift_times.get(shift_code, _OFF_SHIFT)
    return _ResolvedShift(
        code=shift_code,
        display_code=shift.display_code,
        name=shift.name,
        start_hour=shift.start,
        end_hour=shift.end,
        is_working=shift_code != "O",
    )


def _to_shift_model(shift: _ResolvedShift) -> ReadModelShift:
    return ReadModelShift(
        code=shift.code,
        display_code=shift.display_code,
        name=shift.name,
        start_hour=shift.start_hour,
        end_hour=shift.end_hour,
        is_working=shift.is_working,
    )


def _shift_code_for(schedule_type: ScheduleType, team_number: int, target_date: dt_date) -> str:
    shift = _resolve_shift(schedule_type, team_number, target_date)
    code_date = target_date - timedelta(days=1) if shift.code == "N" else target_date
    return f"{_format_yywwd(code_date)}{shift.code}"


def _is_currently_working(
    schedule_type: ScheduleType,
    shift_day: dt_date,
    shift: _ResolvedShift,
    as_of: dt_datetime,
) -> bool:
    if shift.start_hour is None or shift.end_hour is None or not shift.is_working:
        return False
    if _get_current_shift_day(as_of, schedule_type) != shift_day:
        return False
    hour = _decimal_hour(as_of)
    if shift.start_hour > shift.end_hour:
        return hour >= shift.start_hour or hour < shift.end_hour
    return shift.start_hour <= hour < shift.end_hour


def _build_team_status_item(
    schedule_type: ScheduleType,
    team_number: int,
    target_date: dt_date,
    shift_day: dt_date,
    as_of: dt_datetime,
) -> TeamShiftStatusReadModel:
    shift = _resolve_shift(schedule_type, team_number, target_date)
    return TeamShiftStatusReadModel(
        team_number=team_number,
        date=target_date,
        shift_day=shift_day,
        shift_code=_shift_code_for(schedule_type, team_number, target_date),
        shift=_to_shift_model(shift),
        is_currently_working=_is_currently_working(schedule_type, shift_day, shift, as_of),
    )


def _get_current_working_team(
    schedule_type: ScheduleType,
    as_of: dt_datetime,
) -> TeamShiftStatusReadModel | None:
    today = as_of.date()
    for candidate_date in (today, today - timedelta(days=1)):
        for team_number in range(1, _SCHEDULES[schedule_type].team_count + 1):
            item = _build_team_status_item(
                schedule_type=schedule_type,
                team_number=team_number,
                target_date=candidate_date,
                shift_day=_get_current_shift_day(as_of, schedule_type),
                as_of=as_of,
            )
            if item.is_currently_working:
                return item
    return None


def compute_next_shifts_for_team(
    schedule_type: ScheduleType,
    team_number: int,
    *,
    as_of: dt_datetime,
    limit: int,
) -> list[NextShiftItemReadModel]:
    """Return upcoming working shifts for any team in the given schedule."""
    return _get_next_shifts(schedule_type, team_number, as_of=as_of, limit=limit)


def _get_next_shifts(
    schedule_type: ScheduleType,
    team_number: int,
    *,
    as_of: dt_datetime,
    limit: int,
) -> list[NextShiftItemReadModel]:
    items: list[NextShiftItemReadModel] = []
    check_date = _get_current_shift_day(as_of, schedule_type)
    max_lookahead = _SCHEDULES[schedule_type].cycle_length_days * max(limit, 1)

    for _ in range(max_lookahead):
        check_date += timedelta(days=1)
        shift = _resolve_shift(schedule_type, team_number, check_date)
        if not shift.is_working:
            continue
        items.append(
            NextShiftItemReadModel(
                team_number=team_number,
                date=check_date,
                shift_code=_shift_code_for(schedule_type, team_number, check_date),
                shift=_to_shift_model(shift),
            )
        )
        if len(items) >= limit:
            break

    return items


def _get_off_day_progress(
    schedule_type: ScheduleType,
    team_number: int,
    *,
    as_of: dt_datetime,
) -> OffDayProgressReadModel | None:
    config = _SCHEDULES[schedule_type]
    current_day = _get_current_shift_day(as_of, schedule_type)
    current_shift = _resolve_shift(schedule_type, team_number, current_day)
    if current_shift.is_working:
        return None

    period_start: dt_date | None = None
    for index in range(config.cycle_length_days):
        candidate = current_day - timedelta(days=index)
        if _resolve_shift(schedule_type, team_number, candidate).is_working:
            period_start = candidate + timedelta(days=1)
            break
    if period_start is None:
        period_start = current_day

    period_length = 0
    for index in range(config.cycle_length_days):
        candidate = period_start + timedelta(days=index)
        if _resolve_shift(schedule_type, team_number, candidate).is_working:
            break
        period_length += 1

    if period_length <= 0:
        return None

    return OffDayProgressReadModel(
        current=(current_day - period_start).days + 1,
        total=period_length,
    )


def _resolve_time_off_window(entry: TimeOffEntry, on_or_after: dt_date) -> tuple[dt_date, dt_date] | None:
    if entry.entry_kind == "date" and entry.date is not None:
        if entry.date < on_or_after:
            return None
        return entry.date, entry.date
    if entry.entry_kind == "range" and entry.start_date is not None and entry.end_date is not None:
        if entry.end_date < on_or_after:
            return None
        return entry.start_date, entry.end_date
    if entry.entry_kind == "weekly" and entry.weekday is not None:
        delta = (entry.weekday - on_or_after.isoweekday()) % 7
        occurrence = on_or_after + timedelta(days=delta)
        return occurrence, occurrence
    return None


def _is_active_time_off(entry: TimeOffEntry, on_date: dt_date) -> bool:
    if entry.entry_kind == "date" and entry.date is not None:
        return entry.date == on_date
    if entry.entry_kind == "range" and entry.start_date is not None and entry.end_date is not None:
        return entry.start_date <= on_date <= entry.end_date
    if entry.entry_kind == "weekly" and entry.weekday is not None:
        return entry.weekday == on_date.isoweekday()
    return False


def _to_time_off_item(
    entry: TimeOffEntry,
    *,
    starts_on: dt_date,
    ends_on: dt_date,
    is_active: bool,
) -> TimeOffSummaryItemReadModel:
    return TimeOffSummaryItemReadModel(
        entry_id=entry.entry_id,
        entry_kind=entry.entry_kind,
        entry_type=entry.entry_type,
        entry_flag=entry.entry_flag,
        note=entry.note,
        starts_on=starts_on,
        ends_on=ends_on,
        is_recurring_weekly=entry.entry_kind == "weekly",
        is_active=is_active,
    )


def _build_time_off_summary(
    *,
    as_of: dt_datetime,
    entries: list[TimeOffEntry],
    limit: int = 5,
) -> TimeOffSummaryReadModel:
    today = as_of.date()
    active_items: list[TimeOffSummaryItemReadModel] = []
    upcoming_items: list[TimeOffSummaryItemReadModel] = []

    for entry in entries:
        if _is_active_time_off(entry, today):
            if entry.entry_kind == "range" and entry.start_date is not None and entry.end_date is not None:
                starts_on, ends_on = entry.start_date, entry.end_date
            else:
                starts_on, ends_on = today, today
            active_items.append(_to_time_off_item(entry, starts_on=starts_on, ends_on=ends_on, is_active=True))
            continue

        window = _resolve_time_off_window(entry, today)
        if window is None:
            continue
        upcoming_items.append(_to_time_off_item(entry, starts_on=window[0], ends_on=window[1], is_active=False))

    active_items.sort(key=lambda item: (item.starts_on, item.ends_on, item.entry_id))
    upcoming_items.sort(key=lambda item: (item.starts_on, item.ends_on, item.entry_id))

    return TimeOffSummaryReadModel(
        as_of=as_of,
        active_items=active_items,
        upcoming_items=upcoming_items[:limit],
        total_upcoming=len(upcoming_items),
    )


def _build_work_context(preferences_data: Mapping[str, Any]) -> ReadModelWorkContext:
    schedule_type = _resolve_schedule_type(preferences_data.get("scheduleType"))
    raw_team_number = preferences_data.get("myTeam")
    team_number = raw_team_number if isinstance(raw_team_number, int) else None

    effective_team_number: int | None = None
    state: ReadModelState = "missing_work_context"

    if schedule_type is not None:
        config = _SCHEDULES[schedule_type]
        if config.team_count == 1:
            effective_team_number = 1
            state = "ready"
        elif team_number is not None and 1 <= team_number <= config.team_count:
            effective_team_number = team_number
            state = "ready"

    settings = _as_mapping(preferences_data.get("settings"))
    return ReadModelWorkContext(
        schedule_type=schedule_type,
        team_number=team_number,
        effective_team_number=effective_team_number,
        state=state,
        feature_flags=ReadModelFeatureFlags(
            time_off_enabled=bool(settings.get("enableTimeOff")),
        ),
    )


async def get_schedule_type_for_user(session: AsyncSession, user_id: int) -> ScheduleType | None:
    """Return just the user's configured schedule type, or None if unset.

    A lightweight alternative to build_dashboard_read_model() for callers
    that only need the schedule type: it issues a single preferences query
    instead of also fetching the user row, computing time-off entries, and
    building a full team_status list for every team in the schedule.
    """
    preferences = await get_user_preferences(session, user_id)
    preferences_data = preferences.data if preferences is not None else {}
    return _build_work_context(preferences_data).schedule_type


async def get_work_context_for_user(session: AsyncSession, user_id: int) -> ReadModelWorkContext:
    """Return the user's full work context (schedule type + effective team number).

    Like get_schedule_type_for_user, but also resolves the effective team number
    (defaulting to 1 for single-team schedules) — for callers such as the push
    reminder scheduler that need to compute an actual next shift, not just know
    which schedule is configured.
    """
    preferences = await get_user_preferences(session, user_id)
    preferences_data = preferences.data if preferences is not None else {}
    return _build_work_context(preferences_data)


def compute_current_shift_day(as_of: dt_datetime, schedule_type: ScheduleType) -> dt_date:
    """Return the calendar date a night shift still in progress at `as_of` belongs to.

    Public wrapper for callers outside this module (e.g. the push reminder
    scheduler) that need the same day-boundary handling `_build_work_context`'s
    callers get internally: a night shift running past midnight still counts
    as the previous day's shift until it ends.
    """
    return _get_current_shift_day(as_of, schedule_type)


def compute_shift_for_team(
    schedule_type: ScheduleType,
    team_number: int,
    target_date: dt_date,
) -> ReadModelShift:
    """Return the shift (working or off) for one team on one calendar date.

    Public wrapper for callers that need a single date's shift directly rather
    than searching forward for the next working one (compute_next_shifts_for_team
    always searches strictly after its as_of date, so it can't answer "is the
    team already working today, and if so when does that shift start").
    """
    return _to_shift_model(_resolve_shift(schedule_type, team_number, target_date))


async def build_dashboard_read_model(
    session: AsyncSession,
    principal: AuthenticatedPrincipal,
    *,
    as_of: dt_datetime | None = None,
    timezone: str = "UTC",
    next_shift_limit: int = 3,
) -> DashboardReadModel:
    resolved_as_of = as_utc(as_of or dt_datetime.now(UTC))
    local_as_of = resolved_as_of.astimezone(ZoneInfo(timezone))
    user = await get_user(session, principal.user_id)
    preferences = await get_user_preferences(session, principal.user_id)
    preferences_data = preferences.data if preferences is not None else {}
    work_context = _build_work_context(preferences_data)

    current_status = CurrentStatusReadModel(
        as_of=resolved_as_of,
        current_shift=None,
        currently_working_team=None,
        off_day_progress=None,
    )
    next_shifts = NextShiftsReadModel(as_of=resolved_as_of, items=[])
    team_status = TeamStatusReadModel(as_of=resolved_as_of, items=[])

    if work_context.state == "ready" and work_context.schedule_type is not None:
        schedule_type = work_context.schedule_type
        effective_team_number = work_context.effective_team_number
        if effective_team_number is not None:
            shift_day = _get_current_shift_day(local_as_of, schedule_type)
            current_status = CurrentStatusReadModel(
                as_of=resolved_as_of,
                current_shift=_build_team_status_item(
                    schedule_type=schedule_type,
                    team_number=effective_team_number,
                    target_date=shift_day,
                    shift_day=shift_day,
                    as_of=local_as_of,
                ),
                currently_working_team=_get_current_working_team(schedule_type, local_as_of),
                off_day_progress=_get_off_day_progress(
                    schedule_type=schedule_type,
                    team_number=effective_team_number,
                    as_of=local_as_of,
                ),
            )
            next_shifts = NextShiftsReadModel(
                as_of=resolved_as_of,
                items=_get_next_shifts(
                    schedule_type=schedule_type,
                    team_number=effective_team_number,
                    as_of=local_as_of,
                    limit=next_shift_limit,
                ),
            )
            shift_day = _get_current_shift_day(local_as_of, schedule_type)
            team_status = TeamStatusReadModel(
                as_of=resolved_as_of,
                items=[
                    _build_team_status_item(
                        schedule_type=schedule_type,
                        team_number=team_number,
                        target_date=shift_day,
                        shift_day=shift_day,
                        as_of=local_as_of,
                    )
                    for team_number in range(1, _SCHEDULES[schedule_type].team_count + 1)
                ],
            )

    time_off_entries = await list_time_off_entries(
        session,
        user_id=principal.user_id,
        start_date=local_as_of.date(),
    )

    return DashboardReadModel(
        as_of=resolved_as_of,
        identity=ReadModelIdentity(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            is_admin=principal.is_admin,
        ),
        work_context=work_context,
        current_status=current_status,
        next_shifts=next_shifts,
        team_status=team_status,
        time_off_summary=_build_time_off_summary(as_of=local_as_of, entries=time_off_entries),
    )
