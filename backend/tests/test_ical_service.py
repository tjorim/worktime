from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest

from app.services import ical_service


def _patch_ical(
    monkeypatch: pytest.MonkeyPatch,
    *,
    schedule_type: str | None = None,
    team_number: int | None = None,
    time_off_entries: list[SimpleNamespace] | None = None,
    tasks: list[SimpleNamespace] | None = None,
    labels: list[SimpleNamespace] | None = None,
    work_locations: list[SimpleNamespace] | None = None,
    settings: dict[str, object] | None = None,
    public_holidays: set[date] | None = None,
) -> SimpleNamespace:
    monkeypatch.setattr(
        ical_service,
        "get_work_context_for_user",
        AsyncMock(return_value=SimpleNamespace(schedule_type=schedule_type, effective_team_number=team_number)),
    )
    monkeypatch.setattr(ical_service, "list_time_off_entries", AsyncMock(return_value=time_off_entries or []))
    list_tasks_mock = AsyncMock(return_value=tasks or [])
    monkeypatch.setattr(ical_service, "list_tasks", list_tasks_mock)
    monkeypatch.setattr(ical_service, "list_labels_for_user", AsyncMock(return_value=labels or []))
    list_work_locations_mock = AsyncMock(return_value=work_locations or [])
    monkeypatch.setattr(ical_service, "list_work_locations", list_work_locations_mock)
    monkeypatch.setattr(
        ical_service,
        "get_user_preferences",
        AsyncMock(return_value=SimpleNamespace(data={"settings": settings or {}})),
    )
    # Never hit the real (network-backed) holiday fetch from a unit test -
    # tests that care about holiday suppression pass public_holidays directly.
    public_holidays_mock = AsyncMock(return_value=public_holidays or set())
    monkeypatch.setattr(ical_service, "_public_holiday_dates", public_holidays_mock)
    return SimpleNamespace(
        list_tasks=list_tasks_mock,
        list_work_locations=list_work_locations_mock,
        public_holiday_dates=public_holidays_mock,
    )


def _task(
    *,
    text: str,
    start: datetime,
    stop: datetime | None,
    label_id: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(text=text, start_time=start, stop_time=stop, label_id=label_id)


def test_escape_normalizes_all_line_endings() -> None:
    assert ical_service._escape("one\r\ntwo\rthree\nfour") == "one\\ntwo\\nthree\\nfour"


@pytest.mark.asyncio
async def test_feed_contains_stable_utc_shift_and_time_off_events(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="leave-1",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="full_day",
                note="Beach, then home",
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "\r\n" in feed
    assert "UID:time-off-leave-1-2026-08-24@worktime" in feed
    assert "DTSTART;VALUE=DATE:20260824" in feed
    assert "DTEND;VALUE=DATE:20260825" in feed
    assert "SUMMARY:Holiday" in feed
    assert "DESCRIPTION:Beach\\, then home" in feed
    assert "COLOR:red" in feed  # vacation
    # A full-day entry suppresses the shift entirely.
    assert "UID:shift-9-5-1-2026-08-24@worktime" not in feed

    feed_no_leave = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 20))
    assert "UID:shift-9-5-1-2026-08-20@worktime" in feed_no_leave
    assert "DTSTART:20260820T070000Z" in feed_no_leave  # 09:00 Europe/Brussels in summer
    assert "DTEND:20260820T150000Z" in feed_no_leave
    assert "COLOR:darkorange" in feed_no_leave  # 9-5's "D" shift


@pytest.mark.asyncio
async def test_weekly_time_off_is_bounded_and_expanded(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_ical(
        monkeypatch,
        time_off_entries=[
            SimpleNamespace(
                entry_id="weekly",
                entry_kind="weekly",
                date=None,
                start_date=None,
                end_date=None,
                weekday=1,
                entry_type="course",
                entry_flag="full_day",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:time-off-weekly-2026-05-25@worktime" in feed
    assert "UID:time-off-weekly-2027-08-23@worktime" not in feed
    assert "SUMMARY:Training" in feed


@pytest.mark.asyncio
async def test_range_time_off_includes_its_end_date(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_ical(
        monkeypatch,
        time_off_entries=[
            SimpleNamespace(
                entry_id="range",
                entry_kind="range",
                date=None,
                start_date=date(2026, 8, 24),
                end_date=date(2026, 8, 26),
                weekday=None,
                entry_type="vacation",
                entry_flag="full_day",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:time-off-range-2026-08-24@worktime" in feed
    assert "UID:time-off-range-2026-08-25@worktime" in feed
    assert "UID:time-off-range-2026-08-26@worktime" in feed
    assert "UID:time-off-range-2026-08-27@worktime" not in feed


@pytest.mark.asyncio
async def test_full_day_time_off_suppresses_its_shift_event(monkeypatch: pytest.MonkeyPatch) -> None:
    # 5-shift/team 1 resolves to a Night shift (23:00 -> 07:00) on 2026-08-25.
    # A full-day time-off entry dated the 25th should suppress that shift event
    # even though most of its hours land on the 26th - it's keyed by the day
    # the shift *starts*, matching how a user picks the date when requesting
    # "the night shift starting tonight" off.
    _patch_ical(
        monkeypatch,
        schedule_type="5-shift",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="night-off",
                entry_kind="date",
                date=date(2026, 8, 25),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="full_day",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-5-shift-1-2026-08-25@worktime" not in feed
    assert "UID:time-off-night-off-2026-08-25@worktime" in feed
    # A neighboring working day for the same team is unaffected.
    assert "UID:shift-5-shift-1-2026-08-20@worktime" in feed


@pytest.mark.asyncio
async def test_full_day_off_suppresses_shift_for_every_entry_type(monkeypatch: pytest.MonkeyPatch) -> None:
    # Suppression is keyed only on entry_flag == "full_day", not on entry_type -
    # a full-day business trip or training day replaces the shift exactly like
    # a full-day holiday does.
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="trip",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="business",
                entry_flag="full_day",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" not in feed
    assert "SUMMARY:Business trip" in feed


@pytest.mark.asyncio
async def test_public_holiday_suppresses_the_shift(monkeypatch: pytest.MonkeyPatch) -> None:
    # Nobody works on a public holiday, regardless of what the roster pattern
    # says that day - looked up against the same single country the rest of
    # the holiday feature supports (see HOLIDAY_COUNTRY_CODE), matching the
    # frontend's isPublicHolidayForShift. No separate holiday event is added,
    # just the shift suppression.
    mocks = _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        public_holidays={date(2026, 8, 24)},
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" not in feed
    assert "UID:shift-9-5-1-2026-08-20@worktime" in feed  # neighboring working day is unaffected
    assert "Holiday" not in feed  # no standalone holiday event was added
    mocks.public_holiday_dates.assert_awaited_once()
    assert mocks.public_holiday_dates.call_args.args[1] == "NL"


@pytest.mark.asyncio
async def test_night_shift_checks_the_next_day_for_a_public_holiday(monkeypatch: pytest.MonkeyPatch) -> None:
    # 5-shift/team 1 resolves to a Night shift (23:00 -> 07:00) on 2026-08-25
    # (see test_full_day_time_off_suppresses_its_shift_event). A night shift's
    # 8 hours run mostly into the next calendar day (7 of 8 hours), so that's
    # the day whose holiday status should decide whether it's worked -
    # matching the frontend's isPublicHolidayForShift.
    _patch_ical(
        monkeypatch,
        schedule_type="5-shift",
        team_number=1,
        public_holidays={date(2026, 8, 26)},
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-5-shift-1-2026-08-25@worktime" not in feed


@pytest.mark.asyncio
async def test_night_shift_is_unaffected_by_a_holiday_on_its_start_date(monkeypatch: pytest.MonkeyPatch) -> None:
    # A holiday on the night shift's *start* date (rather than the day most
    # of its hours fall on) shouldn't suppress it.
    _patch_ical(
        monkeypatch,
        schedule_type="5-shift",
        team_number=1,
        public_holidays={date(2026, 8, 25)},
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-5-shift-1-2026-08-25@worktime" in feed


@pytest.mark.asyncio
async def test_half_day_entry_on_a_public_holiday_falls_back_to_an_all_day_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The holiday already means no shift exists that day, so there's nothing
    # for a half-day entry to split - it degrades to the same all-day shape
    # used when no schedule is configured at all.
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        public_holidays={date(2026, 8, 24)},
        time_off_entries=[
            SimpleNamespace(
                entry_id="half-on-holiday",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="half_am",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" not in feed
    assert "DTSTART;VALUE=DATE:20260824" in feed
    assert "SUMMARY:Holiday" in feed


@pytest.mark.asyncio
async def test_half_am_off_splits_shift_and_becomes_a_timed_event(monkeypatch: pytest.MonkeyPatch) -> None:
    # 9-5's Day shift runs 09:00-17:00 Europe/Brussels; half_am means the
    # first half (09:00-13:00) is off and the second half (13:00-17:00) is
    # still worked, so the two events should exactly tile across the shift.
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="half-am",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="half_am",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" in feed
    assert "DTSTART:20260824T110000Z" in feed  # 13:00 Europe/Brussels (summer, UTC+2)
    assert "DTEND:20260824T150000Z" in feed  # 17:00
    assert "SUMMARY:Day shift (half day)" in feed

    assert "UID:time-off-half-am-2026-08-24@worktime" in feed
    assert "DTSTART:20260824T070000Z" in feed  # 09:00
    assert "DTEND:20260824T110000Z" in feed  # 13:00
    assert "SUMMARY:Holiday (half day)" in feed
    # A half-day entry is no longer exported as an all-day event.
    assert "DTSTART;VALUE=DATE:20260824" not in feed


@pytest.mark.asyncio
async def test_half_pm_off_splits_shift_the_other_way(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="half-pm",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="half_pm",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "DTSTART:20260824T070000Z" in feed  # shift still works 09:00-13:00
    assert "DTEND:20260824T110000Z" in feed
    assert "UID:time-off-half-pm-2026-08-24@worktime" in feed
    assert "SUMMARY:Holiday (half day)" in feed


@pytest.mark.asyncio
async def test_half_day_without_a_shift_falls_back_to_an_all_day_event(monkeypatch: pytest.MonkeyPatch) -> None:
    # No schedule configured, so there's no shift to split against - the
    # half-day entry keeps the previous all-day event shape.
    _patch_ical(
        monkeypatch,
        time_off_entries=[
            SimpleNamespace(
                entry_id="half-no-shift",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="ill",
                entry_flag="half_am",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "DTSTART;VALUE=DATE:20260824" in feed
    assert "SUMMARY:Sick leave" in feed


@pytest.mark.asyncio
async def test_am_and_pm_half_day_entries_together_suppress_the_shift(monkeypatch: pytest.MonkeyPatch) -> None:
    # Two separate entries - a half_am holiday and a half_pm sick day - cover
    # the whole day between them, so no shift is worked and each entry gets
    # its own timed half event instead of one clobbering the other's slot.
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="am-half",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="half_am",
                note=None,
                deleted_at=None,
            ),
            SimpleNamespace(
                entry_id="pm-half",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="ill",
                entry_flag="half_pm",
                note=None,
                deleted_at=None,
            ),
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" not in feed
    assert "UID:time-off-am-half-2026-08-24@worktime" in feed
    assert "UID:time-off-pm-half-2026-08-24@worktime" in feed
    assert "SUMMARY:Holiday (half day)" in feed
    assert "SUMMARY:Sick leave (half day)" in feed
    assert "DTSTART:20260824T070000Z" in feed  # AM entry covers 09:00-13:00
    assert "DTEND:20260824T110000Z" in feed
    assert "DTSTART:20260824T110000Z" in feed  # PM entry covers 13:00-17:00
    assert "DTEND:20260824T150000Z" in feed


@pytest.mark.asyncio
async def test_duplicate_half_day_entry_for_the_same_half_is_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    # Two half_am entries on the same day is a genuine data duplicate, not a
    # meaningful AM+PM pair - the later one wins the slot and gets the timed
    # event; the earlier, superseded one is dropped entirely rather than
    # falling through to a contradictory all-day event.
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="am-first",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="vacation",
                entry_flag="half_am",
                note=None,
                deleted_at=None,
            ),
            SimpleNamespace(
                entry_id="am-second",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="ill",
                entry_flag="half_am",
                note=None,
                deleted_at=None,
            ),
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:time-off-am-first-2026-08-24@worktime" not in feed
    assert "UID:time-off-am-second-2026-08-24@worktime" in feed
    assert "SUMMARY:Sick leave (half day)" in feed
    assert "SUMMARY:Holiday" not in feed
    # The shift is still trimmed to one half only - not suppressed entirely.
    assert "UID:shift-9-5-1-2026-08-24@worktime" in feed


@pytest.mark.asyncio
async def test_onsite_flag_keeps_full_shift_and_all_day_event(monkeypatch: pytest.MonkeyPatch) -> None:
    # Location/travel flags (onsite/no_fly/can_fly) aren't day-portion splits -
    # the shift is untouched and the entry stays a plain all-day info event.
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        time_off_entries=[
            SimpleNamespace(
                entry_id="onsite",
                entry_kind="date",
                date=date(2026, 8, 24),
                start_date=None,
                end_date=None,
                weekday=None,
                entry_type="business",
                entry_flag="onsite",
                note=None,
                deleted_at=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "DTSTART:20260824T070000Z" in feed
    assert "DTEND:20260824T150000Z" in feed
    assert "DTSTART;VALUE=DATE:20260824" in feed
    assert "SUMMARY:Business trip" in feed


@pytest.mark.asyncio
async def test_work_location_events_classify_against_home_and_office_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_ical(
        monkeypatch,
        settings={"homeCountry": "BE", "officeCountry": "NL"},
        work_locations=[
            SimpleNamespace(date=date(2026, 8, 24), country_code="BE", label=None),
            SimpleNamespace(date=date(2026, 8, 25), country_code="NL", label=None),
            SimpleNamespace(date=date(2026, 8, 26), country_code="DE", label="Berlin office"),
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:day-info-42-2026-08-24@worktime" in feed
    assert "SUMMARY:Working from home" in feed
    assert "UID:day-info-42-2026-08-25@worktime" in feed
    assert "SUMMARY:Working from the office" in feed
    assert "UID:day-info-42-2026-08-26@worktime" in feed
    assert "SUMMARY:Berlin office" in feed
    assert "DESCRIPTION:Country: DE" in feed


@pytest.mark.asyncio
async def test_work_location_without_a_label_falls_back_to_country_code(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_ical(
        monkeypatch,
        work_locations=[SimpleNamespace(date=date(2026, 8, 24), country_code="FR", label=None)],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "SUMMARY:Working from FR" in feed


@pytest.mark.asyncio
async def test_work_location_is_folded_into_the_shift_title_not_a_separate_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        settings={"homeCountry": "BE", "officeCountry": "NL"},
        work_locations=[SimpleNamespace(date=date(2026, 8, 24), country_code="BE", label=None)],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" in feed
    assert "SUMMARY:Day shift — Home" in feed
    # No separate all-day/day-info event for the same day.
    assert "day-info-42-2026-08-24" not in feed
    assert "work-location-2026-08-24" not in feed


@pytest.mark.asyncio
async def test_work_location_and_tracked_time_share_one_fallback_event(monkeypatch: pytest.MonkeyPatch) -> None:
    # No shift configured, so both pieces of info need somewhere to go - they
    # should land on a single event for the day, not one each.
    tz = UTC
    _patch_ical(
        monkeypatch,
        settings={"homeCountry": "BE", "officeCountry": "NL"},
        work_locations=[SimpleNamespace(date=date(2026, 8, 24), country_code="DE", label="Client site")],
        tasks=[
            _task(
                text="Weekend fix",
                start=datetime(2026, 8, 24, 9, 0, tzinfo=tz),
                stop=datetime(2026, 8, 24, 10, 0, tzinfo=tz),
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    events_that_day = feed.count("UID:day-info-42-2026-08-24@worktime")
    assert events_that_day == 1
    assert "SUMMARY:Client site" in feed
    assert "DESCRIPTION:Country: DE\\n11:00–12:00 Weekend fix" in feed


@pytest.mark.asyncio
async def test_tracked_time_is_appended_to_the_shift_description(monkeypatch: pytest.MonkeyPatch) -> None:
    tz = UTC
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        tasks=[
            _task(
                text="Standup",
                start=datetime(2026, 8, 24, 7, 3, tzinfo=tz),
                stop=datetime(2026, 8, 24, 7, 31, tzinfo=tz),
                label_id="meetings",
            ),
            _task(
                text="Feature X",
                start=datetime(2026, 8, 24, 7, 31, tzinfo=tz),
                stop=datetime(2026, 8, 24, 10, 0, tzinfo=tz),
                label_id=None,
            ),
        ],
        labels=[SimpleNamespace(id="meetings", name="Meetings")],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" in feed
    assert "DESCRIPTION:09:03–09:31 Standup (Meetings)\\n09:31–12:00 Feature X" in feed


@pytest.mark.asyncio
async def test_running_task_is_excluded_from_the_description(monkeypatch: pytest.MonkeyPatch) -> None:
    tz = UTC
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        tasks=[
            _task(
                text="Still going",
                start=datetime(2026, 8, 24, 7, 3, tzinfo=tz),
                stop=None,
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-24@worktime" in feed
    assert "Still going" not in feed
    # No finished tasks that day, so no DESCRIPTION line was added at all.
    lines = feed.split("\r\n")
    shift_block = lines[lines.index("UID:shift-9-5-1-2026-08-24@worktime") :]
    shift_block = shift_block[: shift_block.index("END:VEVENT") + 1]
    assert not any(line.startswith("DESCRIPTION:") for line in shift_block)


@pytest.mark.asyncio
async def test_planned_future_task_is_excluded_from_tracked_time(monkeypatch: pytest.MonkeyPatch) -> None:
    # A "planned" task (see db_service.get_next_planned_task) has both
    # start_time and stop_time set while both are still in the future - it
    # hasn't actually happened yet, so it must not show up as completed work.
    tz = UTC
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        tasks=[
            _task(
                text="Planned deep work",
                start=datetime(2030, 8, 26, 7, 0, tzinfo=tz),
                stop=datetime(2030, 8, 26, 9, 0, tzinfo=tz),
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2030, 8, 22))

    assert "UID:shift-9-5-1-2030-08-26@worktime" in feed
    assert "Planned deep work" not in feed
    lines = feed.split("\r\n")
    shift_block = lines[lines.index("UID:shift-9-5-1-2030-08-26@worktime") :]
    shift_block = shift_block[: shift_block.index("END:VEVENT") + 1]
    assert not any(line.startswith("DESCRIPTION:") for line in shift_block)


@pytest.mark.asyncio
async def test_task_and_location_queries_use_brussels_local_window_boundaries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The feed's start/end are exclusive-at-end Brussels-local calendar dates
    # (matching _time_off_dates and the shift loop) - the task and work
    # location lookups must use the same boundaries, not UTC-midnight
    # equivalents or an inclusive end date, or a boundary day's contents
    # could be dropped or leak one day past the window.
    mocks = _patch_ical(monkeypatch)

    await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    tasks_call = mocks.list_tasks.call_args
    assert tasks_call.kwargs["start_date"] == datetime(2026, 5, 22, 0, 0, tzinfo=ZoneInfo("Europe/Brussels"))
    assert tasks_call.kwargs["end_date"] == datetime(
        2027, 8, 21, 23, 59, 59, 999999, tzinfo=ZoneInfo("Europe/Brussels")
    )

    locations_call = mocks.list_work_locations.call_args
    assert locations_call.kwargs["start_date"] == date(2026, 5, 22)
    assert locations_call.kwargs["end_date"] == date(2027, 8, 21)


@pytest.mark.asyncio
async def test_tracked_time_without_a_shift_gets_a_fallback_event(monkeypatch: pytest.MonkeyPatch) -> None:
    tz = UTC
    _patch_ical(
        monkeypatch,
        tasks=[
            _task(
                text="Weekend fix",
                start=datetime(2026, 8, 24, 9, 0, tzinfo=tz),
                stop=datetime(2026, 8, 24, 10, 0, tzinfo=tz),
            )
        ],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:day-info-42-2026-08-24@worktime" in feed
    assert "SUMMARY:Time tracked" in feed
    assert "DESCRIPTION:11:00–12:00 Weekend fix" in feed


@pytest.mark.asyncio
async def test_tracked_time_on_a_scheduled_off_day_gets_its_own_event(monkeypatch: pytest.MonkeyPatch) -> None:
    # 2026-08-29 is a Saturday, an "O" (off) day in 9-5's pattern - logging
    # time against a high-priority issue on a day off shouldn't be silently
    # dropped, and shouldn't be attached to a shift event that doesn't exist.
    tz = UTC
    _patch_ical(
        monkeypatch,
        schedule_type="9-5",
        team_number=1,
        tasks=[
            _task(
                text="Fix prod outage",
                start=datetime(2026, 8, 29, 14, 0, tzinfo=tz),
                stop=datetime(2026, 8, 29, 16, 30, tzinfo=tz),
                label_id="incident",
            )
        ],
        labels=[SimpleNamespace(id="incident", name="Incident")],
    )

    feed = await ical_service.build_ical_feed(AsyncMock(), 42, today=date(2026, 8, 22))

    assert "UID:shift-9-5-1-2026-08-29@worktime" not in feed
    assert "UID:day-info-42-2026-08-29@worktime" in feed
    assert "SUMMARY:Time tracked" in feed
    assert "DESCRIPTION:16:00–18:30 Fix prod outage (Incident)" in feed
