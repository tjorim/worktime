"""Time-off entry ORM model."""

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClientTimestampMixin, _utc_now


class TimeOffEntry(ClientTimestampMixin, Base):
    """Structured time-off entry for account-backed sync.

    ``entry_id`` is the client-generated stable identity for a logical
    time-off entry. ``entry_kind`` determines which scheduling shape is active:
    ``date`` uses ``date``; ``range`` uses ``start_date`` + ``end_date``;
    ``weekly`` uses ``weekday``.
    """

    __tablename__ = "time_off_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_id: Mapped[str] = mapped_column(String, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entry_kind: Mapped[str] = mapped_column(String, nullable=False, default="date")
    date: Mapped[dt_date | None] = mapped_column(Date, nullable=True, index=True)
    start_date: Mapped[dt_date | None] = mapped_column(Date, nullable=True, index=True)
    end_date: Mapped[dt_date | None] = mapped_column(Date, nullable=True, index=True)
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    entry_type: Mapped[str] = mapped_column(String, nullable=False, default="vacation")
    entry_flag: Mapped[str] = mapped_column(String, nullable=False, default="full_day")
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    __table_args__ = (
        Index(
            "uq_time_off_user_entry_id",
            "user_id",
            "entry_id",
            unique=True,
        ),
        CheckConstraint("entry_kind IN ('date', 'range', 'weekly')", name="ck_time_off_entry_kind"),
        CheckConstraint(
            "entry_type IN ('vacation','business','course','in','weekend','birthday','ill','other')",
            name="ck_time_off_entry_type",
        ),
        CheckConstraint(
            "entry_flag IN ('full_day','half_am','half_pm','onsite','no_fly','can_fly')",
            name="ck_time_off_entry_flag",
        ),
        CheckConstraint("weekday BETWEEN 1 AND 7 OR weekday IS NULL", name="ck_time_off_weekday_range"),
        CheckConstraint(
            "entry_kind = 'date' AND date IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND weekday IS NULL"
            " OR entry_kind = 'range' AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date < end_date AND date IS NULL AND weekday IS NULL"
            " OR entry_kind = 'weekly' AND weekday IS NOT NULL AND date IS NULL AND start_date IS NULL AND end_date IS NULL",
            name="ck_time_off_shape",
        ),
        Index("ix_time_off_entries_user_id_updated_at", "user_id", "updated_at"),
    )
