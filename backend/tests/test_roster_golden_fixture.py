"""Cross-checks the backend's hand-copied roster config and shift-code algorithm
against the frontend's source of truth (frontend/src/data/rosters.ts and
frontend/src/utils/shiftCalculations.ts), via a golden fixture generated from
the frontend.

See #1107: nothing else ties the two implementations together, so a roster
change applied to rosters.ts alone (a new schedule, a corrected reference
date, adjusted shift hours) would otherwise silently desync the Pebble
dashboard and MCP schedule tools from the web UI, with no failing check
anywhere. After changing frontend/src/data/rosters.ts, run
"pnpm run generate-roster-fixture" in frontend/ and commit the regenerated
fixture; frontend CI's check-roster-fixture step fails if that step was
skipped, and this test fails if the backend's copy in
read_models_service.py wasn't updated to match.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app.read_models import ScheduleType
from app.services.read_models_service import _SCHEDULES, _shift_code_for  # noqa: PLC2701

_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "roster_golden.json"


@pytest.fixture(scope="module")
def golden_fixture() -> dict[str, Any]:
    return json.loads(_FIXTURE_PATH.read_text())


class TestRosterConfigMatchesFrontend:
    """Compares _SCHEDULES against the config exported from rosters.ts."""

    def test_schedule_types_match(self, golden_fixture: dict[str, Any]) -> None:
        assert set(_SCHEDULES.keys()) == set(golden_fixture["schedules"].keys())

    @pytest.mark.parametrize("schedule_type", ["9-5", "2-shift", "weekend-shift", "5-shift"])
    def test_schedule_config_matches(self, golden_fixture: dict[str, Any], schedule_type: ScheduleType) -> None:
        expected = golden_fixture["schedules"][schedule_type]
        actual = _SCHEDULES[schedule_type]

        assert actual.team_count == expected["teamCount"]
        assert actual.cycle_length_days == expected["cycleLengthDays"]
        assert actual.reference_date.isoformat() == expected["referenceDate"]
        assert list(actual.schedule_pattern) == expected["schedulePattern"]

        assert set(actual.shift_times.keys()) == set(expected["shiftTimes"].keys())
        for code, expected_shift in expected["shiftTimes"].items():
            actual_shift = actual.shift_times[code]
            assert actual_shift.name == expected_shift["name"]
            assert actual_shift.start == expected_shift["start"]
            assert actual_shift.end == expected_shift["end"]
            assert actual_shift.display_code == expected_shift["displayCode"]


class TestShiftCodesMatchFrontend:
    """Reproduces getShiftCode()'s output for a sample of (schedule, team, date)
    triples spanning multiple cycles, catching drift in the offset/resolution
    algorithm itself rather than just the static config.
    """

    def test_shift_codes_match(self, golden_fixture: dict[str, Any]) -> None:
        mismatches = []
        for entry in golden_fixture["shiftCodes"]:
            target_date = date.fromisoformat(entry["date"])
            actual_code = _shift_code_for(entry["schedule"], entry["team"], target_date)
            if actual_code != entry["code"]:
                mismatches.append(
                    f"{entry['schedule']} team {entry['team']} {entry['date']}: "
                    f"backend={actual_code!r} frontend={entry['code']!r}"
                )

        assert not mismatches, "\n".join(mismatches)
