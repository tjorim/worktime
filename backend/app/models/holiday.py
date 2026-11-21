"""Cached holiday ORM model."""

from datetime import datetime as dt_datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utc_now


class CachedHoliday(Base):
    """Persisted holiday data from upstream holiday APIs.

    Each row represents one upstream API response for a specific
    (holiday_type, country, year, subdivision, language) cache-key tuple.
    Holiday payloads are currently normalized so persisted rows typically store
    ``language=None``, but the language column remains part of the unique
    constraint for cache-key completeness.
    The ``data`` column holds the raw JSON list returned by the API.
    ``fetched_at`` is used to determine staleness:
    - current and future years: stale after 24 h
    - past years: stale after 7 days
    """

    __tablename__ = "cached_holidays"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    holiday_type: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    subdivision: Mapped[str | None] = mapped_column(String, nullable=True)
    language: Mapped[str | None] = mapped_column(String(2), nullable=True)
    data: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    fetched_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )

    __table_args__ = (
        UniqueConstraint(
            "holiday_type",
            "country",
            "year",
            "subdivision",
            "language",
            name="uq_cached_holiday",
            postgresql_nulls_not_distinct=True,
        ),
    )
