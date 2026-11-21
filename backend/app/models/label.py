"""Label ORM model."""

from datetime import datetime as dt_datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClientTimestampMixin, _utc_now


class Label(ClientTimestampMixin, Base):
    """Time tracking label for categorizing tasks and templates."""

    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    color: Mapped[str] = mapped_column(String)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now
    )
    deleted_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "uq_active_label_user_name",
            "user_id",
            "name",
            unique=True,
            postgresql_where=sql_text("deleted_at IS NULL"),
            sqlite_where=sql_text("deleted_at IS NULL"),
        ),
        Index("ix_time_tracking_labels_user_id_updated_at", "user_id", "updated_at"),
        # This table was renamed from time_tracking_labels in production, and a
        # table RENAME does not carry over dependent index names — these three
        # single-column indexes keep their pre-rename names to match what's
        # actually live, same as the composite index above and the
        # id/user_id constraint names in migrations/versions/000_baseline.py.
        Index("ix_time_tracking_labels_user_id", "user_id"),
        Index("ix_time_tracking_labels_updated_at", "updated_at"),
        Index("ix_time_tracking_labels_deleted_at", "deleted_at"),
    )
