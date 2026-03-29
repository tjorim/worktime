"""SQLAlchemy ORM models for Worktime persistence."""

from datetime import UTC
from datetime import date as dt_date
from datetime import datetime as dt_datetime
from datetime import time as dt_time
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    func,
)
from sqlalchemy import (
    false as sa_false,
)
from sqlalchemy import (
    text as sql_text,
)
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
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    hashed_password: Mapped[str] = mapped_column(String)
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
