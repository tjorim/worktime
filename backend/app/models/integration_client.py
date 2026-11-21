"""Integration client ORM model."""

from datetime import datetime as dt_datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utc_now


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
