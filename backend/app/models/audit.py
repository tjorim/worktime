"""Audit entry ORM model."""

from datetime import datetime as dt_datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utc_now


class AuditEntry(Base):
    """Transactional, durable record of a mutation performed via REST or MCP.

    Written by ``app.services.audit.db.write_audit_entry`` into the *same* database
    transaction as the mutation it describes (staged via ``session.add`` and
    committed by the caller), so a mutation can never commit without leaving
    an audit trail, and a failed mutation never leaves an orphaned entry.
    This is the authoritative audit record; the rotated file logger in
    ``app.services.audit.logger`` (from #984) remains as secondary, best-effort
    operational telemetry only.

    Exception: bulk changes applied via ``sync_service.push_changes`` (the
    offline-sync batch upload) are deliberately excluded — see the comment
    there for why.
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
