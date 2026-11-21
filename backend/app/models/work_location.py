"""Work location ORM model."""

from datetime import date as dt_date
from datetime import datetime as dt_datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClientTimestampMixin, _utc_now


class WorkLocation(ClientTimestampMixin, Base):
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
    deleted_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    __table_args__ = (
        Index(
            "uq_active_work_location_user_date",
            "user_id",
            "date",
            unique=True,
            postgresql_where=sql_text("deleted_at IS NULL"),
            sqlite_where=sql_text("deleted_at IS NULL"),
        ),
        Index("ix_work_locations_user_id_updated_at", "user_id", "updated_at"),
    )
