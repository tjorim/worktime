"""Unit tests for the pure helpers behind the shift-reminder push scheduler.

These require no database, mirroring test_shift_calculations.py's approach.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.services.shift_reminder_scheduler import (
    _combine_local,
    _in_quiet_hours,
    _resolve_target_shift,
)


class TestCombineLocal:
    def test_whole_hour(self) -> None:
        result = _combine_local(date(2025, 7, 17), 9.0, "UTC")
        assert result == datetime(2025, 7, 17, 9, 0, tzinfo=ZoneInfo("UTC"))

    def test_half_hour(self) -> None:
        result = _combine_local(date(2025, 7, 17), 6.5, "UTC")
        assert result == datetime(2025, 7, 17, 6, 30, tzinfo=ZoneInfo("UTC"))

    def test_applies_named_timezone(self) -> None:
        result = _combine_local(date(2025, 7, 17), 9.0, "Europe/Brussels")
        assert result.hour == 9
        assert result.tzinfo == ZoneInfo("Europe/Brussels")

    def test_falls_back_to_utc_for_unknown_timezone(self) -> None:
        result = _combine_local(date(2025, 7, 17), 9.0, "Not/AZone")
        assert result.utcoffset() == datetime(2025, 7, 17, 9, tzinfo=ZoneInfo("UTC")).utcoffset()


class TestInQuietHours:
    def test_no_window_configured(self) -> None:
        assert _in_quiet_hours(datetime(2025, 7, 17, 23, 0), None, None) is False

    def test_simple_window(self) -> None:
        assert _in_quiet_hours(datetime(2025, 7, 17, 10, 0), 9, 17) is True
        assert _in_quiet_hours(datetime(2025, 7, 17, 8, 0), 9, 17) is False
        assert _in_quiet_hours(datetime(2025, 7, 17, 17, 0), 9, 17) is False

    def test_window_wraps_past_midnight(self) -> None:
        assert _in_quiet_hours(datetime(2025, 7, 17, 23, 0), 22, 6) is True
        assert _in_quiet_hours(datetime(2025, 7, 17, 3, 0), 22, 6) is True
        assert _in_quiet_hours(datetime(2025, 7, 17, 10, 0), 22, 6) is False


class TestResolveTargetShift:
    def test_uses_todays_shift_when_not_yet_started(self) -> None:
        # Team 1 works Morning (07:00-15:00) on 2025-07-17.
        local_now = datetime(2025, 7, 17, 6, 0, tzinfo=ZoneInfo("UTC"))
        target = _resolve_target_shift("5-shift", 1, local_now, "UTC")
        assert target is not None
        target_date, shift, start_time = target
        assert target_date == date(2025, 7, 17)
        assert shift.code == "M"
        assert start_time == datetime(2025, 7, 17, 7, 0, tzinfo=ZoneInfo("UTC"))

    def test_falls_through_to_next_shift_once_todays_has_started(self) -> None:
        # Same anchor, but now() is past 07:00 so today's Morning shift no
        # longer qualifies; the next working shift is Evening on 07-18.
        local_now = datetime(2025, 7, 17, 8, 45, tzinfo=ZoneInfo("UTC"))
        target = _resolve_target_shift("5-shift", 1, local_now, "UTC")
        assert target is not None
        target_date, shift, start_time = target
        assert target_date == date(2025, 7, 18)
        assert shift.code == "L"
        assert start_time == datetime(2025, 7, 18, 15, 0, tzinfo=ZoneInfo("UTC"))

    def test_single_team_schedule_resolves_next_working_day(self) -> None:
        # 9-5 doesn't work weekends; from a Friday evening the next shift is Monday.
        local_now = datetime(2025, 7, 18, 20, 0, tzinfo=ZoneInfo("UTC"))  # Friday
        target = _resolve_target_shift("9-5", 1, local_now, "UTC")
        assert target is not None
        target_date, shift, _start_time = target
        assert target_date == date(2025, 7, 21)  # Monday
        assert shift.code == "D"
