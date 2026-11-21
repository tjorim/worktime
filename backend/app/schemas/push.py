"""Web Push subscription, FCM device token and VAPID key schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from urllib.parse import urlparse

from pydantic import Field, field_validator

from app.schemas.base import NonEmptyText, RequestModel, ResponseModel


class PushSubscriptionKeys(RequestModel):
    """The two keys the browser's PushManager returns alongside the endpoint."""

    p256dh: NonEmptyText
    auth: NonEmptyText


# The backend later issues an authenticated server-side HTTP request straight to
# this URL (pywebpush's webpush() call in push_service.py) using the caller-supplied
# value verbatim. Without an allowlist, an authenticated user could register an
# internal/loopback/link-local address as their "push endpoint" and get the backend
# to make requests to it on their behalf (SSRF) roughly once a minute. Real browser
# PushManager subscriptions only ever come from this small, stable set of push
# services, so restricting to known hosts costs nothing for legitimate use.
_ALLOWED_PUSH_ENDPOINT_HOSTS = frozenset(
    {
        "fcm.googleapis.com",  # Chrome, Edge, Firefox for Android, most Chromium browsers
        "updates.push.services.mozilla.com",  # Firefox desktop
        "web.push.apple.com",  # Safari (macOS/iOS 16.4+)
    }
)


_ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = (".notify.windows.com",)  # Edge/Windows (WNS)


def _is_allowed_push_endpoint_host(hostname: str) -> bool:
    hostname = hostname.lower()
    return hostname in _ALLOWED_PUSH_ENDPOINT_HOSTS or hostname.endswith(_ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES)


class PushSubscriptionCreate(RequestModel):
    """Payload for registering (or updating, by re-posting) a browser's push subscription."""

    endpoint: str = Field(min_length=1, max_length=2048)
    keys: PushSubscriptionKeys
    timezone: str = "UTC"

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        parsed = urlparse(value)
        # Reject userinfo, backslashes and control characters: parsers disagree on them, so the
        # hostname checked here could differ from the host the HTTP client actually connects to.
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or "\\" in value
            or "@" in parsed.netloc
            or any(ord(char) < 0x21 for char in value)
            or not _is_allowed_push_endpoint_host(parsed.hostname)
        ):
            raise ValueError("endpoint must be a known browser push service URL")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown timezone: {value!r}") from exc
        return value


class PushSubscriptionRead(ResponseModel):
    """A registered push subscription, without its auth secret."""

    id: str
    endpoint: str
    timezone: str
    created_at: dt_datetime
    updated_at: dt_datetime


class FcmTokenCreate(RequestModel):
    """Payload for registering (or updating, by re-posting) an Android device's
    FCM registration token.
    """

    token: str = Field(min_length=1, max_length=4096)


class FcmTokenRead(ResponseModel):
    """A registered FCM device token, without the token value itself."""

    id: str
    created_at: dt_datetime
    updated_at: dt_datetime


class VapidPublicKeyResponse(ResponseModel):
    """Public key for ``PushManager.subscribe()``; null when Web Push is not configured."""

    publicKey: str | None
