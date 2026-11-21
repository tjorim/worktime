"""Unit tests for shift schedule calculations.

These tests cover the pure functions in read_models_service and require no
database — they mirror the structural + behavioural coverage in the frontend's
rosters.test.ts while adding deterministic shift-resolution assertions.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.services.read_models_service import (
    compute_current_shift_day,
    compute_next_shifts_for_team,
    compute_shift_for_team,
)

# Anchor used in test_read_models.py and the frontend rosters.test.ts examples.
_AS_OF_5SHIFT = datetime(2025, 7, 17, 8, 30, tzinfo=UTC)


class TestScheduleStructure:
    """Mirror of the structural assertions in the frontend rosters.test.ts."""

    def test_all_four_schedules_are_defined(self) -> None:
        # Import the private dict only here so tests fail loudly if it moves.
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        assert set(_SCHEDULES.keys()) == {"9-5", "2-shift", "weekend-shift", "5-shift"}

    def test_team_counts(self) -> None:
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        assert _SCHEDULES["9-5"].team_count == 1
        assert _SCHEDULES["2-shift"].team_count == 4
        assert _SCHEDULES["weekend-shift"].team_count == 2
        assert _SCHEDULES["5-shift"].team_count == 5

    def test_cycle_lengths(self) -> None:
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        assert _SCHEDULES["9-5"].cycle_length_days == 7
        assert _SCHEDULES["2-shift"].cycle_length_days == 28
        assert _SCHEDULES["weekend-shift"].cycle_length_days == 14
        assert _SCHEDULES["5-shift"].cycle_length_days == 10

    def test_5shift_pattern(self) -> None:
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        assert list(_SCHEDULES["5-shift"].schedule_pattern) == ["M", "M", "L", "L", "N", "N", "O", "O", "O", "O"]

    def test_9_5_pattern(self) -> None:
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        assert list(_SCHEDULES["9-5"].schedule_pattern) == ["D", "D", "D", "D", "D", "O", "O"]

    def test_night_shift_spans_midnight(self) -> None:
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        night = _SCHEDULES["5-shift"].shift_times["N"]
        assert night.start is not None and night.end is not None
        # Night shift: start > end means it crosses midnight
        assert night.start > night.end

    def test_non_night_shifts_do_not_span_midnight(self) -> None:
        from app.services.read_models_service import _SCHEDULES  # noqa: PLC2701

        for schedule in _SCHEDULES.values():
            for code, defn in schedule.shift_times.items():
                if code == "O" or defn.start is None or defn.end is None:
                    continue
                if code == "N":
                    continue
                assert defn.start < defn.end, f"{code} in {schedule} should not span midnight"


class TestComputeNextShiftsForTeam:
    """Behavioural tests for the public compute_next_shifts_for_team helper."""

    def test_returns_only_working_shifts(self) -> None:
        items = compute_next_shifts_for_team("5-shift", 1, as_of=_AS_OF_5SHIFT, limit=10)
        assert all(item.shift.is_working for item in items)

    def test_respects_limit(self) -> None:
        for limit in (1, 3, 5):
            items = compute_next_shifts_for_team("5-shift", 1, as_of=_AS_OF_5SHIFT, limit=limit)
            assert len(items) == limit

    def test_items_are_in_chronological_order(self) -> None:
        items = compute_next_shifts_for_team("5-shift", 1, as_of=_AS_OF_5SHIFT, limit=5)
        dates = [item.date for item in items]
        assert dates == sorted(dates)

    def test_team_number_is_set_on_each_item(self) -> None:
        items = compute_next_shifts_for_team("5-shift", 3, as_of=_AS_OF_5SHIFT, limit=3)
        assert all(item.team_number == 3 for item in items)

    # -- Deterministic shift assertions anchored to 2025-07-17 --

    def test_5shift_team1_next_two_shifts(self) -> None:
        # Verified against test_read_models.py: next shifts are L on 18th, L on 19th.
        items = compute_next_shifts_for_team("5-shift", 1, as_of=_AS_OF_5SHIFT, limit=2)
        assert items[0].date.isoformat() == "2025-07-18"
        assert items[0].shift.code == "L"
        assert items[1].date.isoformat() == "2025-07-19"
        assert items[1].shift.code == "L"

    def test_5shift_team3_next_nightshift(self) -> None:
        # Team 3 offset = (3-1)*2 = 4 days. Working backwards from reference
        # date 2025-07-16: team 3's next night shifts fall on 2025-07-24/25.
        items = compute_next_shifts_for_team("5-shift", 3, as_of=_AS_OF_5SHIFT, limit=10)
        night_items = [item for item in items if item.shift.code == "N"]
        assert len(night_items) >= 1
        assert night_items[0].date.isoformat() == "2025-07-24"

    def test_9_5_returns_only_day_shifts(self) -> None:
        items = compute_next_shifts_for_team("9-5", 1, as_of=_AS_OF_5SHIFT, limit=5)
        assert all(item.shift.code == "D" for item in items)

    def test_invalid_team_number_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid team number"):
            compute_next_shifts_for_team("5-shift", 6, as_of=_AS_OF_5SHIFT, limit=1)

    def test_team_number_zero_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid team number"):
            compute_next_shifts_for_team("5-shift", 0, as_of=_AS_OF_5SHIFT, limit=1)


class TestComputeShiftForTeam:
    """Public wrapper used by the push reminder scheduler to check "today's shift"."""

    def test_returns_team1_morning_shift_on_anchor_date(self) -> None:
        shift = compute_shift_for_team("5-shift", 1, date(2025, 7, 17))
        assert shift.code == "M"
        assert shift.is_working is True
        assert shift.start_hour == 7.0
        assert shift.end_hour == 15.0

    def test_off_day_is_not_working(self) -> None:
        # Team 1 is off 2025-07-22 through 07-25 (see the M/L/L/N/N/O/O/O/O cycle
        # anchored at the 07-17 reference date above).
        shift = compute_shift_for_team("5-shift", 1, date(2025, 7, 22))
        assert shift.is_working is False
        assert shift.start_hour is None
        assert shift.end_hour is None

    def test_invalid_team_number_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid team number"):
            compute_shift_for_team("5-shift", 6, date(2025, 7, 17))


class TestComputeCurrentShiftDay:
    """Public wrapper for the night-shift day-boundary handling."""

    def test_before_night_shift_end_belongs_to_previous_day(self) -> None:
        as_of = datetime(2025, 7, 17, 2, 30, tzinfo=UTC)
        assert compute_current_shift_day(as_of, "5-shift") == date(2025, 7, 16)

    def test_after_night_shift_end_belongs_to_same_day(self) -> None:
        as_of = datetime(2025, 7, 17, 8, 30, tzinfo=UTC)
        assert compute_current_shift_day(as_of, "5-shift") == date(2025, 7, 17)

    def test_schedule_without_night_shift_always_returns_calendar_date(self) -> None:
        as_of = datetime(2025, 7, 17, 2, 30, tzinfo=UTC)
        assert compute_current_shift_day(as_of, "9-5") == date(2025, 7, 17)
