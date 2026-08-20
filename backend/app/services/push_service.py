"""Sends Web Push messages to a browser's subscribed push endpoint."""

from __future__ import annotations

import json
import logging
from enum import Enum, auto

from pywebpush import WebPushException, webpush

from app.config.settings import settings
from app.database.models import PushSubscription

logger = logging.getLogger(__name__)

# Push services (FCM, Mozilla autopush, etc.) return these when the
# subscription itself is gone — the user unsubscribed, cleared site data,
# or uninstalled the browser/PWA. Any other error is treated as transient.
_SUBSCRIPTION_GONE_STATUSES = {404, 410}


class PushSendResult(Enum):
    SENT = auto()
    SUBSCRIPTION_GONE = auto()
    FAILED = auto()


def send_push(subscription: PushSubscription, payload: dict[str, str]) -> PushSendResult:
    """Send one Web Push message. Blocking (pywebpush uses `requests`) —
    call via `asyncio.to_thread` from async code.
    """
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh_key, "auth": subscription.auth_key},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
        return PushSendResult.SENT
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code in _SUBSCRIPTION_GONE_STATUSES:
            return PushSendResult.SUBSCRIPTION_GONE
        logger.warning("Push send failed for subscription %s: %s", subscription.id, exc)
        return PushSendResult.FAILED
