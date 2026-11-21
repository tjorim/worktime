"""Time-tracking task and template ORM models."""

from datetime import datetime as dt_datetime
from datetime import time as dt_time
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Time, func
from sqlalchemy import false as sa_false
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClientTimestampMixin, _utc_now


class TimeTrackingTask(ClientTimestampMixin, Base):
    """Tracked work task entry."""

    __tablename__ = "time_tracking_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    label_id: Mapped[str | None] = mapped_column(String, ForeignKey("labels.id"), nullable=True, index=True)
    gantt_task_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("gantt_tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(String)
    start_time: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    stop_time: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    includes_break: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    # Set once the planned-task-starting-soon reminder (see
    # app.services.planned_task_reminder_scheduler) has been sent for this task, so the
    # periodic scan doesn't re-send while the task is still upcoming. Reset to None
    # whenever start_time changes (a reschedule needs a fresh reminder window).
    reminder_sent_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set only once _send_reminder actually finishes handling a claim (success
    # or a deliberate give-up), never at claim time -- lets
    # _release_stale_claims tell an abandoned claim (process crashed between
    # the claim and this) apart from a normal already-sent one.
    reminder_completed_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    __table_args__ = (
        Index(
            "uq_active_running_task_user",
            "user_id",
            unique=True,
            postgresql_where=sql_text("stop_time IS NULL AND deleted_at IS NULL"),
            sqlite_where=sql_text("stop_time IS NULL AND deleted_at IS NULL"),
        ),
        Index("ix_time_tracking_tasks_user_id_updated_at", "user_id", "updated_at"),
        Index("ix_time_tracking_tasks_user_id_start_time", "user_id", "start_time"),
        # Backs the periodic reminder scan (a global scan across all users' upcoming
        # planned tasks, not scoped to one user_id like the composite index above).
        Index(
            "ix_time_tracking_tasks_pending_reminder",
            "start_time",
            postgresql_where=sql_text("reminder_sent_at IS NULL AND stop_time IS NOT NULL AND deleted_at IS NULL"),
            sqlite_where=sql_text("reminder_sent_at IS NULL AND stop_time IS NOT NULL AND deleted_at IS NULL"),
        ),
    )


class TimeTrackingTemplate(ClientTimestampMixin, Base):
    """Reusable time tracking template."""

    __tablename__ = "time_tracking_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    label_id: Mapped[str | None] = mapped_column(String, ForeignKey("labels.id"), nullable=True, index=True)
    text: Mapped[str] = mapped_column(String)
    start_time: Mapped[dt_time] = mapped_column(Time)
    stop_time: Mapped[dt_time] = mapped_column(Time)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now, index=True
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    __table_args__ = (Index("ix_time_tracking_templates_user_id_updated_at", "user_id", "updated_at"),)
