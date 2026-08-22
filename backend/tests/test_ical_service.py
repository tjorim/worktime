from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import ical_service


@pytest.mark.asyncio
async def test_feed_contains_stable_utc_shift_and_time_off_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        ical_service,
        "get_work_context_for_user",
        AsyncMock(return_value=SimpleNamespace(schedule_type="9-5", effective_team_number=1)),
    )
    monkeypatch.setattr(
        ical_service,
        "list_time_off_entries",
        AsyncMock(return_value=[SimpleNamespace(
            entry_id="leave-1", entry_kind="date", date=date(2026, 8, 24),
            start_date=None, end_date=None, weekday=None, entry_type="vacation",
            note="Beach, then home", deleted_at=None,
        )]),
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "\r\n" in feed
    assert "UID:shift-9-5-1-2026-08-24@worktime" in feed
    assert "DTSTART:20260824T070000Z" in feed  # 09:00 Europe/Brussels in summer
    assert "DTEND:20260824T150000Z" in feed
    assert "UID:time-off-leave-1-2026-08-24@worktime" in feed
    assert "DTSTART;VALUE=DATE:20260824" in feed
    assert "DTEND;VALUE=DATE:20260825" in feed
    assert "DESCRIPTION:Beach\\, then home" in feed


@pytest.mark.asyncio
async def test_weekly_time_off_is_bounded_and_expanded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        ical_service,
        "get_work_context_for_user",
        AsyncMock(return_value=SimpleNamespace(schedule_type=None, effective_team_number=None)),
    )
    monkeypatch.setattr(
        ical_service,
        "list_time_off_entries",
        AsyncMock(return_value=[SimpleNamespace(
            entry_id="weekly", entry_kind="weekly", date=None, start_date=None, end_date=None,
            weekday=1, entry_type="course", note=None, deleted_at=None,
        )]),
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:time-off-weekly-2026-05-25@worktime" in feed
    assert "UID:time-off-weekly-2027-08-23@worktime" not in feed
