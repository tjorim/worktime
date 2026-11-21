"""User preferences ORM model."""

from datetime import datetime as dt_datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClientTimestampMixin, _utc_now


class UserPreferences(ClientTimestampMixin, Base):
    """Account-backed storage for a user's local-first preferences/settings blob.

    One row per user.  The ``data`` column stores the full ``worktime_user_state``
    JSON payload as-is from the client.  ``client_updated_at`` carries the
    client-side timestamp used for last-write-wins conflict detection during sync.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
