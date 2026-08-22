"""RFC 5545 calendar feed generation for shifts and time off."""

from __future__ import annotations

import calendar
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import TimeOffEntry
from app.services.db_service import list_time_off_entries
from app.services.read_models_service import _resolve_shift, get_work_context_for_user

_WORKTIME_TIMEZONE = ZoneInfo("Europe/Brussels")


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


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


def _time_off_dates(entry: TimeOffEntry, start: date, end: date) -> Iterable[date]:
    if entry.entry_kind == "date" and entry.date is not None:
        if start <= entry.date < end:
            yield entry.date
    elif entry.entry_kind == "range" and entry.start_date is not None and entry.end_date is not None:
        day = max(start, entry.start_date)
        while day < min(end, entry.end_date):
            yield day
            day += timedelta(days=1)
    elif entry.entry_kind == "weekly" and entry.weekday is not None:
        day = start + timedelta(days=(entry.weekday - start.isoweekday()) % 7)
        while day < end:
            yield day
            day += timedelta(days=7)


async def build_ical_feed(session: AsyncSession, user_id: int, *, today: date | None = None) -> str:
    today = today or datetime.now(UTC).date()
    start, end = _add_months(today, -3), _add_months(today, 12)
    context = await get_work_context_for_user(session, user_id)
    entries = await list_time_off_entries(session, user_id=user_id)
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
    if context.schedule_type is not None and context.effective_team_number is not None:
        day = start
        while day < end:
            shift = _resolve_shift(context.schedule_type, context.effective_team_number, day)
            if shift.is_working and shift.start_hour is not None and shift.end_hour is not None:
                starts = _utc_at(day, shift.start_hour)
                ends = _utc_at(day, shift.end_hour)
                if ends <= starts:
                    ends += timedelta(days=1)
                lines.extend(
                    [
                        "BEGIN:VEVENT",
                        f"UID:shift-{context.schedule_type}-{context.effective_team_number}-{day.isoformat()}@worktime",
                        f"DTSTAMP:{stamp}",
                        f"DTSTART:{starts:%Y%m%dT%H%M%SZ}",
                        f"DTEND:{ends:%Y%m%dT%H%M%SZ}",
                        f"SUMMARY:{_escape(shift.name)} shift",
                        "END:VEVENT",
                    ]
                )
            day += timedelta(days=1)
    for entry in entries:
        if entry.deleted_at is not None:
            continue
        for day in _time_off_dates(entry, start, end):
            summary = entry.entry_type.replace("_", " ").title()
            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:time-off-{entry.entry_id}-{day.isoformat()}@worktime",
                    f"DTSTAMP:{stamp}",
                    f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
                    f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
                    f"SUMMARY:{_escape(summary)}",
                    *([f"DESCRIPTION:{_escape(entry.note)}"] if entry.note else []),
                    "END:VEVENT",
                ]
            )
    lines.append("END:VCALENDAR")
    return "\r\n".join(part for line in lines for part in _fold(line)) + "\r\n"
