"""Gantt task ORM model."""

from datetime import date as dt_date
from datetime import datetime as dt_datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClientTimestampMixin, _utc_now


class GanttTask(ClientTimestampMixin, Base):
    """Personal Gantt chart task."""

    __tablename__ = "gantt_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label_id: Mapped[str | None] = mapped_column(String, ForeignKey("labels.id"), nullable=True, index=True)
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
    deleted_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    __table_args__ = (
        Index("ix_gantt_tasks_user_id_updated_at", "user_id", "updated_at"),
        CheckConstraint("start_date <= end_date", name="ck_gantt_tasks_date_range"),
    )
