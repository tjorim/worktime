"""Personal access token ORM model."""

from datetime import datetime as dt_datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utc_now


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
