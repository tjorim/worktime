"""Periodic background loop that sends Web Push shift reminders.

Mirrors the app.config.oidc_config._periodic_jwks_refresh_loop pattern: an
asyncio task, started at app startup and cancelled at shutdown, that sleeps
and re-checks on a fixed interval. Failures in one iteration are logged and
swallowed so a transient error (a push provider outage, a bad row) never
kills the loop for every other subscription.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, timedelta
from datetime import date as dt_date
from datetime import datetime as dt_datetime
from typing import TYPE_CHECKING, Any, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from sqlalchemy.engine import CursorResult

from app.database.engine import get_session_factory
from app.database.models import PushSubscription
from app.read_models import ReadModelShift, ScheduleType
from app.services.push_service import PushSendResult, send_push
from app.services.push_subscription_service import (
    delete_subscription_by_id,
    list_all_subscriptions,
)
from app.services.read_models_service import (
    compute_current_shift_day,
    compute_next_shifts_for_team,
    compute_shift_for_team,
    get_work_context_for_user,
)

logger = logging.getLogger(__name__)

REMINDER_CHECK_INTERVAL_SECONDS = 60


def _combine_local(target_date: dt_date, decimal_hour: float, tz_name: str) -> dt_datetime:
    """Combine a calendar date and a roster's decimal-hour shift start (e.g. 6.5 =
    06:30) into an absolute instant in the subscription's stored timezone.
    """
    hour = int(decimal_hour) % 24
    minute = round((decimal_hour - int(decimal_hour)) * 60) % 60
    naive = dt_datetime.combine(target_date, dt_datetime.min.time()).replace(hour=hour, minute=minute)
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = UTC
    return naive.replace(tzinfo=tz)


def _in_quiet_hours(local_now: dt_datetime, start: int | None, end: int | None) -> bool:
    if start is None or end is None:
        return False
    hour = local_now.hour
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end  # window wraps past midnight


def _resolve_target_shift(
    schedule_type: ScheduleType,
    team_number: int,
    local_now: dt_datetime,
    tz_name: str,
) -> tuple[dt_date, ReadModelShift, dt_datetime] | None:
    """Return (date, shift, start_time) for the shift the user should be reminded
    about: today's own shift if it hasn't started yet, otherwise the next
    working day. Mirrors the frontend's useShiftNotifications hook, which
    checks the same two cases for the same reason -- compute_next_shifts_for_team
    always searches strictly *after* its as_of date, so it can't see a shift
    later today that just hasn't started.
    """
    shift_day = compute_current_shift_day(local_now, schedule_type)
    today_shift = compute_shift_for_team(schedule_type, team_number, shift_day)
    if today_shift.is_working and today_shift.start_hour is not None:
        start_time = _combine_local(shift_day, today_shift.start_hour, tz_name)
        if start_time > local_now:
            return shift_day, today_shift, start_time

    upcoming = compute_next_shifts_for_team(schedule_type, team_number, as_of=local_now, limit=1)
    if not upcoming:
        return None
    item = upcoming[0]
    if item.shift.start_hour is None:
        return None
    return item.date, item.shift, _combine_local(item.date, item.shift.start_hour, tz_name)


async def _maybe_send_reminder(
    session: AsyncSession,
    subscription: PushSubscription,
    *,
    now_utc: dt_datetime | None = None,
) -> None:
    work_context = await get_work_context_for_user(session, subscription.user_id)
    if work_context.state != "ready" or work_context.schedule_type is None:
        return
    team_number = work_context.effective_team_number
    if team_number is None:
        return

    now_utc = now_utc if now_utc is not None else dt_datetime.now(UTC)
    try:
        local_tz = ZoneInfo(subscription.timezone)
    except ZoneInfoNotFoundError:
        local_tz = UTC
    local_now = now_utc.astimezone(local_tz)

    target = _resolve_target_shift(work_context.schedule_type, team_number, local_now, subscription.timezone)
    if target is None:
        return
    target_date, shift, start_time = target

    reminder_key = f"{target_date.isoformat()}-{shift.code}"
    if subscription.last_reminder_key == reminder_key:
        return

    reminder_time = start_time - timedelta(minutes=subscription.lead_time_minutes)
    if not (reminder_time <= local_now < start_time):
        return

    if _in_quiet_hours(local_now, subscription.quiet_hours_start, subscription.quiet_hours_end):
        # Respect the user's quiet hours by treating this shift as handled rather
        # than firing late the moment quiet hours end -- a reminder that arrives
        # after the window it was meant to warn about opened is worse than none.
        subscription.last_reminder_key = reminder_key
        subscription.last_reminder_claimed_at = now_utc
        return

    # Atomically claim this reminder before sending: if more than one backend
    # process/replica runs this loop, each reads the same unset last_reminder_key
    # and would otherwise all decide to send. Only the process whose UPDATE
    # actually changes the row (rowcount 1) proceeds -- the rest see rowcount 0
    # and back off, so the push is delivered at most once per shift.
    #
    # claimed_at identifies this specific claim *attempt*, not just which shift
    # it's for: a settings upsert (push_subscription_service.upsert_subscription)
    # resets last_reminder_key to None, so a different process can legitimately
    # reclaim the very same reminder_key string for a newer attempt. Comparing the
    # failed-send cleanup below against reminder_key alone couldn't tell that newer
    # claim apart from this one; comparing against claimed_at can, since a reclaim
    # always re-stamps it.
    claimed_at = now_utc
    claim = cast(
        "CursorResult[Any]",
        await session.execute(
            update(PushSubscription)
            .where(PushSubscription.id == subscription.id)
            .where(PushSubscription.last_reminder_key.is_distinct_from(reminder_key))
            .values(last_reminder_key=reminder_key, last_reminder_claimed_at=claimed_at)
        ),
    )
    await session.commit()
    if claim.rowcount == 0:
        return  # another process already claimed (or sent) this reminder
    subscription.last_reminder_key = reminder_key
    subscription.last_reminder_claimed_at = claimed_at

    result = await asyncio.to_thread(
        send_push,
        subscription,
        {
            "title": "Upcoming shift",
            "body": f"{shift.name} shift starts at {start_time.strftime('%H:%M')}",
            "url": "/",
        },
    )
    if result is PushSendResult.SUBSCRIPTION_GONE:
        await delete_subscription_by_id(session, subscription.id)
    elif result is PushSendResult.FAILED:
        # Release the claim so a later tick retries the send -- but only if it's
        # still ours, identified by claimed_at rather than reminder_key (see above).
        await session.execute(
            update(PushSubscription)
            .where(PushSubscription.id == subscription.id)
            .where(PushSubscription.last_reminder_claimed_at == claimed_at)
            .values(last_reminder_key=None, last_reminder_claimed_at=None)
        )
        await session.commit()
    # SENT: last_reminder_key/last_reminder_claimed_at are already set from the claim above.


async def _check_and_send_reminders() -> None:
    factory = get_session_factory()
    async with factory() as session:
        subscriptions = await list_all_subscriptions(session)
        for subscription in subscriptions:
            try:
                await _maybe_send_reminder(session, subscription)
            except Exception:
                logger.warning(
                    "Shift reminder check failed for subscription %s (non-fatal)",
                    subscription.id,
                    exc_info=True,
                )
                # A DB-level failure mid-statement leaves Postgres refusing further
                # commands until the transaction is rolled back -- without this,
                # one bad subscription would poison the shared session and silently
                # break every subscription still left in this batch, not just this one.
                await session.rollback()
        await session.commit()


async def _periodic_shift_reminder_loop() -> None:
    while True:
        try:
            await asyncio.sleep(REMINDER_CHECK_INTERVAL_SECONDS)
            await _check_and_send_reminders()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Shift reminder loop iteration failed (non-fatal)", exc_info=True)


def start_periodic_shift_reminders() -> asyncio.Task[None]:
    """Start the background shift-reminder loop and return its task for shutdown cancellation.

    Callers should check settings.push_notifications_enabled first -- this
    function doesn't, so it stays trivially testable without needing VAPID
    keys configured.
    """
    return asyncio.create_task(_periodic_shift_reminder_loop())
