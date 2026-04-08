"""SQLAlchemy ORM models for Worktime persistence."""

from datetime import UTC
from datetime import date as dt_date
from datetime import datetime as dt_datetime
from datetime import time as dt_time
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Time, func
from sqlalchemy import false as sa_false
from sqlalchemy import text as sql_text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utc_now() -> dt_datetime:
    return dt_datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    """User account and preferences."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, index=True, unique=True)
    supertokens_user_id: Mapped[str] = mapped_column(
        String, unique=True, index=True
    )
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    display_name: Mapped[str] = mapped_column(String)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now
    )


class TimeTrackingLabel(Base):
    """Time tracking label for categorizing tasks and templates."""

    __tablename__ = "time_tracking_labels"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    color: Mapped[str] = mapped_column(String)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    __table_args__ = (
        Index(
            "uq_active_label_user_name",
            "user_id",
            "name",
            unique=True,
            postgresql_where=sql_text("deleted_at IS NULL"),
        ),
    )


class TimeTrackingTask(Base):
    """Tracked work task entry."""

    __tablename__ = "time_tracking_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    label_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("time_tracking_labels.id"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(String)
    start_time: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    stop_time: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    includes_break: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


class TimeTrackingTemplate(Base):
    """Reusable time tracking template."""

    __tablename__ = "time_tracking_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    label_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("time_tracking_labels.id"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(String)
    start_time: Mapped[dt_time] = mapped_column(Time)
    stop_time: Mapped[dt_time] = mapped_column(Time)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


class WorkLocation(Base):
    """Per-day country assignment for where a user worked."""

    __tablename__ = "work_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    date: Mapped[dt_date] = mapped_column(Date, index=True)
    country_code: Mapped[str] = mapped_column(String(2))
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    __table_args__ = (
        Index(
            "uq_active_work_location_user_date",
            "user_id",
            "date",
            unique=True,
            postgresql_where=sql_text("deleted_at IS NULL"),
        ),
    )


class GanttTask(Base):
    """Personal Gantt chart task."""

    __tablename__ = "gantt_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String)
    start_date: Mapped[dt_date] = mapped_column(Date)
    end_date: Mapped[dt_date] = mapped_column(Date)
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default=sql_text("0"))
    dependencies: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )


class UserPreferences(Base):
    """Account-backed storage for a user's local-first preferences/settings blob.

    One row per user.  The ``data`` column stores the full ``worktime_user_state``
    JSON payload as-is from the client.  ``client_updated_at`` carries the
    client-side timestamp used for last-write-wins conflict detection during sync.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    client_updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )


class TimeOffEntry(Base):
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
    client_updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

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
            " OR entry_kind = 'range' AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date AND date IS NULL AND weekday IS NULL"
            " OR entry_kind = 'weekly' AND weekday IS NOT NULL AND date IS NULL AND start_date IS NULL AND end_date IS NULL",
            name="ck_time_off_shape",
        ),
    )
