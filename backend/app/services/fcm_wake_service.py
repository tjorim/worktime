"""Fans an FCM wake-ping out to every device token registered for a user.

Called from the task create/update paths (app.services.db_service) and the sync
push endpoint (app.routers.db_sync) whenever a change could affect the
soonest-starting planned task, so an Android device that's closed learns about
it well before the reminder's ~10-minute lead window opens -- rather than only
at the next foreground refresh. See app.services.fcm_service for what the
message itself carries (nothing but a wake signal) and
app.services.planned_task_reminder_scheduler for the reminder's actual delivery
(Web Push + the Android app's own local alarm), which this only prods into
staying current.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.services.fcm_device_token_service import delete_token_by_id, list_tokens_for_user
from app.services.fcm_service import FcmSendResult, send_wake_signal

logger = logging.getLogger(__name__)


async def send_fcm_wake_ping(session: AsyncSession, user_id: int) -> None:
    """No-op when FCM isn't configured or the user has no registered devices.

    Best-effort: a send failure is logged and swallowed rather than raised --
    this is a latency optimization on top of the existing foreground refresh,
    not the reminder's only delivery path, so it must never fail the caller's
    own request (task creation/update, sync push).
    """
    if not settings.fcm_notifications_enabled:
        return
    tokens = await list_tokens_for_user(session, user_id)
    if not tokens:
        return

    for device_token in tokens:
        try:
            result = await asyncio.to_thread(send_wake_signal, device_token.token)
        except Exception:
            logger.warning("FCM wake-ping failed for device token %s (non-fatal)", device_token.id, exc_info=True)
            continue
        if result is FcmSendResult.TOKEN_INVALID:
            await delete_token_by_id(session, device_token.id)

    await session.commit()
