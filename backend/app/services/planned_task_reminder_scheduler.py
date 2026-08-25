"""Periodic background loop that sends Web Push notifications for time-tracking
tasks logged ahead of time (a "planned" task -- see DailyTaskList.tsx's `isPlanned`)
whose start_time is coming up soon. Also sends a safety-net FCM wake-ping to any
registered Android device at the same time -- the primary wake-ping for Android
fires much earlier, from app.services.fcm_wake_service at task create/update time
(see #1205); this one just covers a device that wasn't registered yet then.

Mirrors the app.config.oidc_config._periodic_jwks_refresh_loop pattern: an
asyncio task, started at app startup and cancelled at shutdown, that sleeps
and re-checks on a fixed interval. Failures in one iteration are logged and
swallowed so a transient error (a push provider outage, a bad row) never
kills the loop for every other task.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, timedelta
from datetime import datetime as dt_datetime
from typing import TYPE_CHECKING, Any, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import ColumnElement, select, update
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from sqlalchemy.engine import CursorResult

from app.config.settings import settings
from app.database.engine import get_session_factory
from app.database.models import TimeTrackingTask
from app.services.fcm_device_token_service import delete_token_by_id, list_tokens_for_user
from app.services.fcm_service import FcmSendResult, send_wake_signal
from app.services.push_service import PushSendResult, send_push
from app.services.push_subscription_service import delete_subscription_by_id, list_subscriptions_for_user

logger = logging.getLogger(__name__)

REMINDER_CHECK_INTERVAL_SECONDS = 60
REMINDER_LEAD_MINUTES = 10


def _due_task_conditions(now_utc: dt_datetime) -> tuple[ColumnElement[bool], ...]:
    """The full eligibility predicate for "planned task whose reminder window is
    open right now" -- shared by the initial scan and the atomic claim below, so
    a task that's deleted, rescheduled, or started between the two can't still
    slip through the claim (which by itself only rechecks reminder_sent_at).
    """
    cutoff = now_utc + timedelta(minutes=REMINDER_LEAD_MINUTES)
    return (
        TimeTrackingTask.reminder_sent_at.is_(None),
        TimeTrackingTask.stop_time.is_not(None),
        TimeTrackingTask.deleted_at.is_(None),
        TimeTrackingTask.start_time > now_utc,
        TimeTrackingTask.start_time <= cutoff,
    )


async def _find_due_tasks(session: AsyncSession, now_utc: dt_datetime) -> list[TimeTrackingTask]:
    """Planned tasks (stop_time set, not yet started) whose reminder window has
    just opened -- i.e. start_time falls within the next REMINDER_LEAD_MINUTES
    minutes -- and haven't been reminded about yet.
    """
    result = await session.execute(select(TimeTrackingTask).where(*_due_task_conditions(now_utc)))
    return list(result.scalars().all())


def _localized_start_time(task: TimeTrackingTask, tz_name: str) -> dt_datetime:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = UTC
    return task.start_time.astimezone(tz)


async def _send_reminder(session: AsyncSession, task: TimeTrackingTask, *, now_utc: dt_datetime) -> None:
    # Atomically claim this task's reminder before sending: if more than one backend
    # process/replica runs this loop, each reads the same unset reminder_sent_at and
    # would otherwise all decide to send. Only the process whose UPDATE actually
    # changes the row (rowcount 1) proceeds -- the rest see rowcount 0 and back off,
    # so the push is delivered at most once per task. Rechecking the full eligibility
    # predicate here (not just reminder_sent_at) closes the gap where the task was
    # deleted, rescheduled, or started in between _find_due_tasks' scan and this claim.
    claim = cast(
        "CursorResult[Any]",
        await session.execute(
            update(TimeTrackingTask)
            .where(TimeTrackingTask.id == task.id)
            .where(*_due_task_conditions(now_utc))
            .values(reminder_sent_at=now_utc)
        ),
    )
    await session.commit()
    if claim.rowcount == 0:
        return  # another process already claimed it, or it's no longer eligible

    subscriptions = await list_subscriptions_for_user(session, task.user_id)
    any_sent = False
    any_failed = False
    for subscription in subscriptions:
        # Each subscription carries the timezone its browser captured at subscribe
        # time, so a task's absolute start_time (stored UTC) is displayed at the
        # wall-clock time that subscription's user actually expects.
        local_start = _localized_start_time(task, subscription.timezone)
        result = await asyncio.to_thread(
            send_push,
            subscription,
            {
                "title": "Starting soon",
                "body": f"{task.text} starts at {local_start.strftime('%H:%M')}",
                "url": "/",
            },
        )
        if result is PushSendResult.SENT:
            any_sent = True
        elif result is PushSendResult.SUBSCRIPTION_GONE:
            await delete_subscription_by_id(session, subscription.id)
        elif result is PushSendResult.FAILED:
            any_failed = True

    if settings.fcm_notifications_enabled:
        # A safety-net wake ping, independent of the retry bookkeeping above: the
        # primary wake-ping fires from app.services.fcm_wake_service at task
        # create/update time (well ahead of this window), so a device that
        # already reconciled from that has nothing new to learn here. This just
        # covers the gap for a device that registered its token, or came back
        # online, after that first ping already went out (or failed).
        for device_token in await list_tokens_for_user(session, task.user_id):
            fcm_result = await asyncio.to_thread(send_wake_signal, device_token.token)
            if fcm_result is FcmSendResult.TOKEN_INVALID:
                await delete_token_by_id(session, device_token.id)

    if any_failed and not any_sent:
        # Every subscription that could have delivered failed transiently (a push
        # provider outage, a network blip) -- release the claim so a later tick,
        # still inside the reminder window, retries it instead of silently losing
        # the only chance to notify this task. Only release if the claim is still
        # ours (reminder_sent_at still equals what we set it to): a concurrent
        # reschedule of this task resets reminder_sent_at to None independently
        # and may already have been reclaimed by a newer attempt by the time this
        # runs, which this comparison protects against clobbering.
        await session.execute(
            update(TimeTrackingTask)
            .where(TimeTrackingTask.id == task.id)
            .where(TimeTrackingTask.reminder_sent_at == now_utc)
            .values(reminder_sent_at=None)
        )
    await session.commit()


async def _check_and_send_reminders() -> None:
    factory = get_session_factory()
    async with factory() as session:
        now_utc = dt_datetime.now(UTC)
        due_tasks = await _find_due_tasks(session, now_utc)
        for task in due_tasks:
            try:
                await _send_reminder(session, task, now_utc=now_utc)
            except Exception:
                logger.warning(
                    "Planned-task reminder send failed for task %s (non-fatal)",
                    task.id,
                    exc_info=True,
                )
                # A DB-level failure mid-statement leaves Postgres refusing further
                # commands until the transaction is rolled back -- without this,
                # one bad task would poison the shared session and silently break
                # every task still left in this batch, not just this one.
                await session.rollback()


async def _periodic_planned_task_reminder_loop() -> None:
    while True:
        try:
            await asyncio.sleep(REMINDER_CHECK_INTERVAL_SECONDS)
            await _check_and_send_reminders()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Planned-task reminder loop iteration failed (non-fatal)", exc_info=True)


def start_periodic_planned_task_reminders() -> asyncio.Task[None]:
    """Start the background planned-task-reminder loop and return its task for shutdown cancellation.

    Callers should check settings.push_notifications_enabled first -- this
    function doesn't, so it stays trivially testable without needing VAPID
    keys configured.
    """
    return asyncio.create_task(_periodic_planned_task_reminder_loop())
