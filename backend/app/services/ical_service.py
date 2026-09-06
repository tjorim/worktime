"""RFC 5545 calendar feed generation for shifts, time off, work location and tracked time."""

from __future__ import annotations

import calendar
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import TimeOffEntry, TimeTrackingTask
from app.routers.holidays import NAGER_BASE_URL, _build_holiday_date_set, _get_or_fetch_holidays
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


def _work_location_short_label(classification: str, country_code: str, label: str | None) -> str:
    if classification == "home":
        return "Home"
    if classification == "office":
        return "Office"
    return label or country_code


def _format_task_line(task: TimeTrackingTask, label_name: str | None) -> str:
    assert task.stop_time is not None
    start_local = task.start_time.astimezone(_WORKTIME_TIMEZONE)
    stop_local = task.stop_time.astimezone(_WORKTIME_TIMEZONE)
    suffix = f" ({label_name})" if label_name else ""
    return f"{start_local:%H:%M}–{stop_local:%H:%M} {task.text}{suffix}"


async def _public_holiday_dates(session: AsyncSession, country: str, years: Iterable[int]) -> set[date]:
    """Return public holiday dates for `country` across `years`, for shift suppression.

    Reuses the same L1/L2 cached fetch path as the `/holidays/public` endpoint,
    but isn't restricted to that endpoint's single supported country - this
    needs to key off the user's own homeCountry. Silently returns an empty set
    for a year where the upstream is unreachable and both cache layers are
    cold, rather than failing the whole feed over an unrelated holiday API.
    """
    iso_dates: set[str] = set()
    for year in years:
        holidays = await _get_or_fetch_holidays(
            holiday_type="public",
            country=country,
            year=year,
            language=None,
            subdivision=None,
            upstream_url=f"{NAGER_BASE_URL}/PublicHolidays/{year}/{country}",
            upstream_params={},
            db=session,
            response_filter=lambda data: [h for h in data if "Public" in h.get("types", [])],
        )
        if holidays:
            iso_dates |= _build_holiday_date_set(holidays)
    return {date.fromisoformat(iso) for iso in iso_dates}


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
    # (day, "am"/"pm") rather than just day, so an AM entry and a PM entry on
    # the same date (e.g. a half-day holiday plus a half-day sick leave) are
    # each tracked instead of one clobbering the other; a second entry for the
    # same day *and* half is a genuine duplicate and the later one wins.
    half_day_off_by_date: dict[date, dict[str, TimeOffEntry]] = {}
    for entry in entries:
        if entry.entry_flag not in _HALF_DAY_FLAGS:
            continue
        half = "am" if entry.entry_flag == "half_am" else "pm"
        for day in _time_off_dates(entry, start, end):
            if day in full_day_off_dates:
                continue
            half_day_off_by_date.setdefault(day, {})[half] = entry
    # An AM entry and a PM entry together cover the whole day, same as a
    # full-day entry would - no shift is worked, so no shift event is emitted.
    fully_covered_by_halves = {day for day, halves in half_day_off_by_date.items() if len(halves) == 2}

    now = datetime.now(UTC)
    tasks = await list_tasks(
        session,
        user_id=user_id,
        start_date=datetime.combine(start, time.min, tzinfo=_WORKTIME_TIMEZONE),
        end_date=datetime.combine(end - timedelta(days=1), time.max, tzinfo=_WORKTIME_TIMEZONE),
    )
    label_names = {label.id: label.name for label in await list_labels_for_user(session, user_id=user_id)}
    tasks_by_day: dict[date, list[str]] = {}
    for task in sorted(tasks, key=lambda t: t.start_time):
        # A planned (not-yet-started) task also has a stop_time set - only a
        # task whose stop_time has already passed represents actual worked time.
        if task.stop_time is None or task.stop_time > now:
            continue
        day = task.start_time.astimezone(_WORKTIME_TIMEZONE).date()
        tasks_by_day.setdefault(day, []).append(_format_task_line(task, label_names.get(task.label_id)))

    # Folded into the shift event's title/description below rather than given
    # their own VEVENT, so a day with both a shift and a work location doesn't
    # end up as two separate all-day-ish entries cluttering the calendar.
    location_by_day = {
        location.date: location
        for location in await list_work_locations(
            session, user_id=user_id, start_date=start, end_date=end - timedelta(days=1)
        )
    }

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
        # A public holiday isn't personal leave - it just means nobody works
        # that day, so no shift is even offered up for splitting by a
        # half-day entry. We don't add a holiday event of our own here, just
        # suppress the shift; the user's own time-off entries (if any) still
        # get their usual event via the loop below.
        home_country = settings.get("homeCountry")
        public_holiday_dates: set[date] = (
            await _public_holiday_dates(session, home_country, range(start.year, end.year + 1))
            if isinstance(home_country, str) and home_country
            else set()
        )
        day = start
        while day < end:
            shift = _resolve_shift(context.schedule_type, context.effective_team_number, day)
            if (
                shift.is_working
                and shift.start_hour is not None
                and shift.end_hour is not None
                and day not in public_holiday_dates
            ):
                shift_start = _utc_at(day, shift.start_hour)
                shift_end = _utc_at(day, shift.end_hour)
                if shift_end <= shift_start:
                    shift_end += timedelta(days=1)
                shift_windows[day] = (shift_start, shift_end)

                if day not in full_day_off_dates and day not in fully_covered_by_halves:
                    halves = half_day_off_by_date.get(day)
                    if halves:
                        ((single_half, _entry),) = halves.items()
                        midpoint = shift_start + (shift_end - shift_start) / 2
                        event_start, event_end = (
                            (midpoint, shift_end) if single_half == "am" else (shift_start, midpoint)
                        )
                        summary_suffix = " (half day)"
                    else:
                        event_start, event_end = shift_start, shift_end
                        summary_suffix = ""
                    color = _SHIFT_COLORS.get(shift.code)
                    description_lines = list(tasks_by_day.get(day, []))
                    location_suffix = ""
                    location = location_by_day.get(day)
                    if location is not None:
                        classification = _classify_work_location(location.country_code, settings)
                        short_label = _work_location_short_label(classification, location.country_code, location.label)
                        location_suffix = f" — {short_label}"
                        if classification == "other":
                            description_lines.insert(0, f"Country: {location.country_code}")
                    description = "\n".join(description_lines)
                    days_with_shift_event.add(day)
                    lines.extend(
                        [
                            "BEGIN:VEVENT",
                            f"UID:shift-{context.schedule_type}-{context.effective_team_number}-{day.isoformat()}@worktime",
                            f"DTSTAMP:{stamp}",
                            f"DTSTART:{event_start:%Y%m%dT%H%M%SZ}",
                            f"DTEND:{event_end:%Y%m%dT%H%M%SZ}",
                            f"SUMMARY:{_escape(shift.name)} shift{summary_suffix}{location_suffix}",
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
            half_key = "am" if entry.entry_flag == "half_am" else "pm"
            halves = half_day_off_by_date.get(day)
            window = shift_windows.get(day)
            if (
                entry.entry_flag in _HALF_DAY_FLAGS
                and halves is not None
                and halves.get(half_key) is entry
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

    # Days with work location and/or tracked time but no shift event (no
    # schedule configured, or the shift was suppressed/never existed) still
    # need somewhere to go - combined into one fallback event per day rather
    # than one each, for the same one-event-per-day reason as the fold-in above.
    fallback_days = (location_by_day.keys() | tasks_by_day.keys()) - days_with_shift_event
    for day in sorted(fallback_days):
        location = location_by_day.get(day)
        description_lines = list(tasks_by_day.get(day, []))
        if location is not None:
            classification = _classify_work_location(location.country_code, settings)
            summary = _work_location_summary(classification, location.country_code, location.label)
            if classification == "other":
                description_lines.insert(0, f"Country: {location.country_code}")
        else:
            summary = "Time tracked"
        description = "\n".join(description_lines)
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:day-info-{day.isoformat()}@worktime",
                f"DTSTAMP:{stamp}",
                f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
                f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
                f"SUMMARY:{_escape(summary)}",
                *([f"DESCRIPTION:{_escape(description)}"] if description else []),
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in _fold(line)) + "\r\n"
