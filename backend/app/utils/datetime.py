"""Datetime utilities shared across the application."""

from datetime import UTC
from datetime import datetime as dt_datetime


def as_utc(dt: dt_datetime) -> dt_datetime:
    """Return *dt* as a UTC-aware datetime.

    Naive datetimes are assumed to be UTC and have their tzinfo set accordingly.
    Timezone-aware datetimes are converted to UTC via ``astimezone``.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def ensure_utc(dt: dt_datetime | None) -> dt_datetime | None:
    """Return *dt* as a UTC-aware datetime, or None if *dt* is None."""
    if dt is None:
        return None
    return as_utc(dt)
