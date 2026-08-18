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
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy import false as sa_false
from sqlalchemy import text as sql_text
from sqlalchemy import true as sa_true
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


class User(Base):
    """User account and preferences."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, index=True, unique=True)
    oidc_subject: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utc_now, default=_utc_now
    )


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
        ),
        Index("ix_time_tracking_labels_user_id_updated_at", "user_id", "updated_at"),
        # This table was renamed from time_tracking_labels in production, and a
        # table RENAME does not carry over dependent index names — these three
        # single-column indexes keep their pre-rename names to match what's
        # actually live, same as the composite index above and the
        # id/user_id constraint names in migrations/versions/001_initial.py.
        Index("ix_time_tracking_labels_user_id", "user_id"),
        Index("ix_time_tracking_labels_updated_at", "updated_at"),
        Index("ix_time_tracking_labels_deleted_at", "deleted_at"),
    )


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
        ),
        Index("ix_time_tracking_tasks_user_id_updated_at", "user_id", "updated_at"),
        Index("ix_time_tracking_tasks_user_id_start_time", "user_id", "start_time"),
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
        ),
        Index("ix_work_locations_user_id_updated_at", "user_id", "updated_at"),
    )


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

    __table_args__ = (Index("ix_gantt_tasks_user_id_updated_at", "user_id", "updated_at"),)


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


class AccessToken(Base):
    """Long-lived personal access token for non-interactive clients (e.g. the Pebble companion app).

    Unlike an OIDC session, this is a static, revocable credential scoped to
    one user. Only the SHA-256 hash of the token is stored; the raw value is
    returned once at creation time and cannot be retrieved again.
    """

    __tablename__ = "access_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True)
    token_preview: Mapped[str] = mapped_column(String)
    scopes: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: ["pebble:read"],
        server_default='["pebble:read"]',
    )
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    last_used_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_access_tokens_user_id_created_at", "user_id", "created_at"),)


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


class IntegrationClient(Base):
    """Managed, database-backed credential for automation/integration callers (e.g. MCP).

    Each row is a revocable, rotatable, rate-limited credential bound to one
    Worktime user.
    Only the HMAC hash of the raw key is stored (see
    ``app.services.integration_client_service.hash_integration_key``); the raw
    value is returned once at creation/rotation time and cannot be recovered.

    ``scopes`` follows the same shape as ``AccessToken.scopes``. The
    well-known ``worktime:mcp`` scope grants ordinary personal-write MCP
    access matching the caller's bound user; ``worktime:admin`` must be
    granted explicitly (never implied) for team-wide/admin-tier access — this
    preserves Worktime's existing ``is_admin`` semantics as a deliberate
    grant rather than a default.
    """

    __tablename__ = "integration_clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    key_preview: Mapped[str] = mapped_column(String(8), nullable=False)
    scopes: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: ["worktime:mcp"],
        server_default='["worktime:mcp"]',
    )
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=120, server_default="120")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa_true())
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )
    last_used_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_limit_window_started_at: Mapped[dt_datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_limit_window_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (Index("ix_integration_clients_user_id_created_at", "user_id", "created_at"),)


class AuditEntry(Base):
    """Transactional, durable record of a mutation performed via REST or MCP.

    Written by ``app.audit.db.write_audit_entry`` into the *same* database
    transaction as the mutation it describes (staged via ``session.add`` and
    committed by the caller), so a mutation can never commit without leaving
    an audit trail, and a failed mutation never leaves an orphaned entry.
    This is the authoritative audit record; the rotated file logger in
    ``app.audit.logger`` (from #984) remains as secondary, best-effort
    operational telemetry only.
    """

    __tablename__ = "audit_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_label: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    auth_source: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[str] = mapped_column(String, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[dt_datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=_utc_now
    )

    __table_args__ = (
        # Stable-pagination read order: (created_at DESC, id DESC). Ties on
        # created_at (same-millisecond entries) still resolve deterministically
        # via the autoincrement id, so keyset pagination never skips or repeats
        # a row across pages.
        Index("ix_audit_entries_created_at_id", "created_at", "id"),
    )
