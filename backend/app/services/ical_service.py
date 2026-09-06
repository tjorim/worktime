"""RFC 5545 calendar feed generation for shifts, time off, work location and tracked time."""

from __future__ import annotations

import calendar
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import TimeOffEntry, TimeTrackingTask
from app.services.db_service import (
    get_user_preferences,
    list_labels_for_user,
    list_tasks,
    list_time_off_entries,
    list_work_locations,
)
from app.services.read_models_service import _resolve_shift, get_work_context_for_user

_WORKTIME_TIMEZONE = ZoneInfo("Europe/Brussels")

# RFC 7986 COLOR property values, as CSS3 extended color keyword names (the
# only form the spec allows - no hex codes). Chosen to match the hex palette
# in frontend/src/lib/hday/presentation.ts (EVENT_COLORS) and
# frontend/src/styles/_variables.scss (--wt-shift-*) as closely as CSS3's
# named-color set allows. Support is inconsistent across clients (Apple
# Calendar and Thunderbird honor per-VEVENT COLOR; Google Calendar and
# Outlook ignore it), so this is a best-effort enhancement, not a guarantee.
_TIME_OFF_COLORS: dict[str, str] = {
    "vacation": "red",
    "business": "orange",
    "course": "goldenrod",
    "in": "teal",
    "weekend": "darkmagenta",
    "birthday": "mediumblue",
    "ill": "darkgreen",
    "other": "darkcyan",
}

_SHIFT_COLORS: dict[str, str] = {
    "M": "royalblue",
    "L": "firebrick",
    "D": "darkorange",
    "N": "purple",
}

# Mirrors frontend/src/lib/hday/presentation.ts's getEventTypeLabel(), so the
# feed's wording matches what the app itself calls each time-off type instead
# of a generic title-cased entry_type.
_ENTRY_TYPE_LABELS: dict[str, str] = {
    "vacation": "Holiday",
    "business": "Business trip",
    "course": "Training",
    "in": "In office",
    "weekend": "Weekend",
    "birthday": "Birthday",
    "ill": "Sick leave",
    "other": "Other",
}

_HALF_DAY_FLAGS = {"half_am", "half_pm"}


def _escape(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    return normalized.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _fold(line: str) -> list[str]:
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return [line]
    result: list[str] = []
    remaining = line
    limit = 75
    while remaining:
        cut = len(remaining)
        while len(remaining[:cut].encode("utf-8")) > limit:
            cut -= 1
        result.append((" " if result else "") + remaining[:cut])
        remaining = remaining[cut:]
        limit = 74
    return result


def _add_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def _utc_at(day: date, decimal_hour: float) -> datetime:
    minutes = round(decimal_hour * 60)
    local = datetime.combine(day, time(), _WORKTIME_TIMEZONE) + timedelta(minutes=minutes)
    return local.astimezone(UTC)


def _entry_type_label(entry_type: str) -> str:
    return _ENTRY_TYPE_LABELS.get(entry_type, entry_type.replace("_", " ").title())


def _time_off_dates(entry: TimeOffEntry, start: date, end: date) -> Iterable[date]:
    if entry.entry_kind == "date" and entry.date is not None:
        if start <= entry.date < end:
            yield entry.date
    elif entry.entry_kind == "range" and entry.start_date is not None and entry.end_date is not None:
        day = max(start, entry.start_date)
        while day < end and day <= entry.end_date:
            yield day
            day += timedelta(days=1)
    elif entry.entry_kind == "weekly" and entry.weekday is not None:
        day = start + timedelta(days=(entry.weekday - start.isoweekday()) % 7)
        while day < end:
            yield day
            day += timedelta(days=7)


def _classify_work_location(country_code: str, settings: Mapping[str, object]) -> str:
    if country_code == settings.get("homeCountry"):
        return "home"
    if country_code == settings.get("officeCountry"):
        return "office"
    return "other"


def _work_location_summary(classification: str, country_code: str, label: str | None) -> str:
    if classification == "home":
        return "Working from home"
    if classification == "office":
        return "Working from the office"
    return label or f"Working from {country_code}"


def _format_task_line(task: TimeTrackingTask, label_name: str | None) -> str:
    assert task.stop_time is not None
    start_local = task.start_time.astimezone(_WORKTIME_TIMEZONE)
    stop_local = task.stop_time.astimezone(_WORKTIME_TIMEZONE)
    suffix = f" ({label_name})" if label_name else ""
    return f"{start_local:%H:%M}–{stop_local:%H:%M} {task.text}{suffix}"


async def build_ical_feed(session: AsyncSession, user_id: int, *, today: date | None = None) -> str:
    today = today or datetime.now(UTC).date()
    start, end = _add_months(today, -3), _add_months(today, 12)
    context = await get_work_context_for_user(session, user_id)
    preferences = await get_user_preferences(session, user_id)
    raw_settings = preferences.data.get("settings") if preferences is not None else None
    settings: Mapping[str, object] = raw_settings if isinstance(raw_settings, Mapping) else {}
    entries = [entry for entry in await list_time_off_entries(session, user_id=user_id) if entry.deleted_at is None]

    # A full-day time-off entry replaces the shift event that day rather than
    # coexisting with it. Matched by the shift's start date (the "day" used to
    # resolve it below), so e.g. a night shift starting 23:00 on the 25th is
    # suppressed by a time-off entry dated the 25th, not the 26th.
    full_day_off_dates = {
        day for entry in entries if entry.entry_flag == "full_day" for day in _time_off_dates(entry, start, end)
    }
    # A half-day (half_am/half_pm) entry doesn't suppress the shift - it splits
    # it: the shift shrinks to the half still worked, and this entry's own
    # event covers the other half instead of spanning the whole day. Keyed by
    # day (not entry) since only one half-day entry can meaningfully apply to
    # a given shift; a later entry for the same day wins.
    half_day_off_by_date: dict[date, tuple[TimeOffEntry, str]] = {
        day: (entry, "am" if entry.entry_flag == "half_am" else "pm")
        for entry in entries
        if entry.entry_flag in _HALF_DAY_FLAGS
        for day in _time_off_dates(entry, start, end)
        if day not in full_day_off_dates
    }

    tasks = await list_tasks(
        session,
        user_id=user_id,
        start_date=datetime.combine(start, time.min, tzinfo=UTC),
        end_date=datetime.combine(end, time.max, tzinfo=UTC),
    )
    label_names = {label.id: label.name for label in await list_labels_for_user(session, user_id=user_id)}
    tasks_by_day: dict[date, list[str]] = {}
    for task in sorted(tasks, key=lambda t: t.start_time):
        if task.stop_time is None:
            continue
        day = task.start_time.astimezone(_WORKTIME_TIMEZONE).date()
        tasks_by_day.setdefault(day, []).append(_format_task_line(task, label_names.get(task.label_id)))

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Worktime//Calendar Feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Worktime",
        "X-WR-TIMEZONE:Europe/Brussels",
    ]
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    # Full shift windows (before any half-day trim), keyed by day - reused to
    # split half-day time-off events at the same midpoint as the shift below,
    # and to know which days already have a shift VEVENT carrying tracked-time
    # details, vs. days that need a standalone tracked-time fallback event.
    shift_windows: dict[date, tuple[datetime, datetime]] = {}
    days_with_shift_event: set[date] = set()

    if context.schedule_type is not None and context.effective_team_number is not None:
        day = start
        while day < end:
            shift = _resolve_shift(context.schedule_type, context.effective_team_number, day)
            if shift.is_working and shift.start_hour is not None and shift.end_hour is not None:
                shift_start = _utc_at(day, shift.start_hour)
                shift_end = _utc_at(day, shift.end_hour)
                if shift_end <= shift_start:
                    shift_end += timedelta(days=1)
                shift_windows[day] = (shift_start, shift_end)

                if day not in full_day_off_dates:
                    half_off = half_day_off_by_date.get(day)
                    if half_off is not None:
                        midpoint = shift_start + (shift_end - shift_start) / 2
                        event_start, event_end = (
                            (midpoint, shift_end) if half_off[1] == "am" else (shift_start, midpoint)
                        )
                        summary_suffix = " (half day)"
                    else:
                        event_start, event_end = shift_start, shift_end
                        summary_suffix = ""
                    color = _SHIFT_COLORS.get(shift.code)
                    description = "\n".join(tasks_by_day.get(day, []))
                    days_with_shift_event.add(day)
                    lines.extend(
                        [
                            "BEGIN:VEVENT",
                            f"UID:shift-{context.schedule_type}-{context.effective_team_number}-{day.isoformat()}@worktime",
                            f"DTSTAMP:{stamp}",
                            f"DTSTART:{event_start:%Y%m%dT%H%M%SZ}",
                            f"DTEND:{event_end:%Y%m%dT%H%M%SZ}",
                            f"SUMMARY:{_escape(shift.name)} shift{summary_suffix}",
                            *([f"DESCRIPTION:{_escape(description)}"] if description else []),
                            *([f"COLOR:{color}"] if color else []),
                            "END:VEVENT",
                        ]
                    )
            day += timedelta(days=1)

    for entry in entries:
        color = _TIME_OFF_COLORS.get(entry.entry_type)
        label = _entry_type_label(entry.entry_type)
        for day in _time_off_dates(entry, start, end):
            half_off = half_day_off_by_date.get(day)
            window = shift_windows.get(day)
            if (
                entry.entry_flag in _HALF_DAY_FLAGS
                and half_off is not None
                and half_off[0] is entry
                and window is not None
            ):
                shift_start, shift_end = window
                midpoint = shift_start + (shift_end - shift_start) / 2
                off_start, off_end = (shift_start, midpoint) if entry.entry_flag == "half_am" else (midpoint, shift_end)
                lines.extend(
                    [
                        "BEGIN:VEVENT",
                        f"UID:time-off-{entry.entry_id}-{day.isoformat()}@worktime",
                        f"DTSTAMP:{stamp}",
                        f"DTSTART:{off_start:%Y%m%dT%H%M%SZ}",
                        f"DTEND:{off_end:%Y%m%dT%H%M%SZ}",
                        f"SUMMARY:{_escape(label)} (half day)",
                        *([f"DESCRIPTION:{_escape(entry.note)}"] if entry.note else []),
                        *([f"COLOR:{color}"] if color else []),
                        "END:VEVENT",
                    ]
                )
            else:
                lines.extend(
                    [
                        "BEGIN:VEVENT",
                        f"UID:time-off-{entry.entry_id}-{day.isoformat()}@worktime",
                        f"DTSTAMP:{stamp}",
                        f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
                        f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
                        f"SUMMARY:{_escape(label)}",
                        *([f"DESCRIPTION:{_escape(entry.note)}"] if entry.note else []),
                        *([f"COLOR:{color}"] if color else []),
                        "END:VEVENT",
                    ]
                )

    for location in await list_work_locations(session, user_id=user_id, start_date=start, end_date=end):
        classification = _classify_work_location(location.country_code, settings)
        summary = _work_location_summary(classification, location.country_code, location.label)
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:work-location-{location.date.isoformat()}@worktime",
                f"DTSTAMP:{stamp}",
                f"DTSTART;VALUE=DATE:{location.date:%Y%m%d}",
                f"DTEND;VALUE=DATE:{location.date + timedelta(days=1):%Y%m%d}",
                f"SUMMARY:{_escape(summary)}",
                f"DESCRIPTION:{_escape(f'Country: {location.country_code}')}",
                "END:VEVENT",
            ]
        )

    for day, task_lines in tasks_by_day.items():
        if day in days_with_shift_event:
            continue
        description = "\n".join(task_lines)
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:tracked-time-{day.isoformat()}@worktime",
                f"DTSTAMP:{stamp}",
                f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
                f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
                "SUMMARY:Time tracked",
                f"DESCRIPTION:{_escape(description)}",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in _fold(line)) + "\r\n"
