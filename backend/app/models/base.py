"""Declarative base, shared timestamp mixin and the UTC clock helper for the ORM models."""

from datetime import UTC
from datetime import datetime as dt_datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utc_now() -> dt_datetime:
    return dt_datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class ClientTimestampMixin:
    """Mixin that adds a client_updated_at column for last-write-wins conflict detection."""

    client_updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
