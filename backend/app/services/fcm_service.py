"""Sends FCM wake-signal messages to an Android device's registration token.

Carries no reminder content -- see app.services.planned_task_reminder_scheduler's
module docstring -- just a silent data message meaning "something changed, go
reconcile now". The Android app's FirebaseMessagingService relays that into the
same refresh-and-reconcile flow the foreground case already uses to arm its
local planned-task reminder alarm.
"""

from __future__ import annotations

import json
import logging
import threading
from enum import Enum, auto

import firebase_admin
from firebase_admin import App, credentials, messaging

from app.config.settings import settings

logger = logging.getLogger(__name__)

_app: App | None = None
_app_lock = threading.Lock()

# Data-only key/value the app's onMessageReceived() looks for -- no title/body,
# since a notification-content message can't be handled while the app process
# is killed the way a data message can.
_WAKE_SIGNAL_DATA = {"type": "sync_changed"}


class FcmSendResult(Enum):
    SENT = auto()
    TOKEN_INVALID = auto()
    FAILED = auto()


def _get_app() -> App:
    global _app
    with _app_lock:
        if _app is None:
            credential = credentials.Certificate(json.loads(settings.FCM_SERVICE_ACCOUNT_JSON))
            _app = firebase_admin.initialize_app(credential, name="worktime-fcm")
        return _app


def send_wake_signal(token: str) -> FcmSendResult:
    """Send one silent FCM wake-ping. Blocking (firebase_admin's HTTP v1 client is
    synchronous) -- call via `asyncio.to_thread` from async code.
    """
    message = messaging.Message(
        token=token,
        data=_WAKE_SIGNAL_DATA,
        android=messaging.AndroidConfig(priority="high"),
    )
    try:
        messaging.send(message, app=_get_app())
        return FcmSendResult.SENT
    except messaging.UnregisteredError:
        # The app was uninstalled, its data was cleared, or the token otherwise
        # expired -- FCM's equivalent of Web Push's 404/410 "subscription gone".
        return FcmSendResult.TOKEN_INVALID
    except Exception as exc:
        logger.warning("FCM send failed: %s", exc)
        return FcmSendResult.FAILED
