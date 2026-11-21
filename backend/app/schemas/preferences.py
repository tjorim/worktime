"""User preferences schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Any

from app.schemas.base import RequestModel, ResponseModel


class UserPreferencesRead(ResponseModel):
    """Response schema for the authenticated user's preferences blob."""

    user_id: int
    data: dict[str, Any]
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime


class UserPreferencesWrite(RequestModel):
    """Request schema for writing the authenticated user's preferences blob.

    ``client_updated_at`` is the client-side timestamp of the local state being
    pushed, used for last-write-wins conflict detection.
    ``data`` is the full preferences JSON object (opaque to the server).
    """

    data: dict[str, Any]
    client_updated_at: dt_datetime
