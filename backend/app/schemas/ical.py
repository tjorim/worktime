"""iCal feed schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime

from app.schemas.base import ResponseModel


class IcalFeedCreated(ResponseModel):
    """New calendar subscription credential; the URL is only returned on rotation."""

    url_path: str


class IcalFeedStatus(ResponseModel):
    """Whether the user currently has an active calendar subscription."""

    configured: bool
    token_preview: str | None = None
    created_at: dt_datetime | None = None
    last_used_at: dt_datetime | None = None
