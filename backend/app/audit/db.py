"""Transactional, durable mutation audit trail (issue #1054).

This is the authoritative audit record. Unlike ``app.audit.logger`` (from
#984 — a fire-and-forget, rotated file write outside the mutation's
transaction), entries here are staged onto the *same* SQLAlchemy session as
the mutation they describe and committed atomically with it: either both
persist or neither does. ``app.audit.logger`` keeps running unchanged as
secondary, best-effort operational telemetry (e.g. for tailing/grepping on
the host) — it is no longer treated as the source of truth for "did this
mutation happen and who did it".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AuditEntry

# Bounded reads: mirrors champagnefestival's DEFAULT_AUDIT_LIMIT/MAX_AUDIT_LIMIT
# so a caller can never pull an unbounded audit trail into memory/context.
DEFAULT_AUDIT_LIMIT = 100
MAX_AUDIT_LIMIT = 1000


class AuditAuthorizationError(Exception):
    """Raised when a caller requests another user's audit trail without admin scope."""


@dataclass(frozen=True)
class AuditActor:
    """Identity of the caller performing a mutation, for the audit trail.

    ``user_id`` is the Worktime user the mutation is attributed to (nullable
    only for the theoretical case of a system-initiated write with no human
    or credential behind it — no current call site needs that). ``label`` is
    a human-readable identity (username, or ``integration:<client name>`` for
    managed integration-client calls) safe to display without a join.
    ``auth_source`` matches ``WorktimeMcpContext.auth_type`` / REST
    ``AuthType`` values (e.g. ``keycloak_user``, ``keycloak_service``,
    ``integration_client``, ``delegated``).
    """

    user_id: int | None
    label: str
    auth_source: str
    subject: str | None = None


async def write_audit_entry(
    db: AsyncSession,
    *,
    actor: AuditActor,
    action: str,
    resource_type: str,
    resource_id: str,
    request_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Stage an audit entry on *db*.

    Does not commit — the caller commits as part of the same transaction as
    the mutation this entry describes. This mirrors champagnefestival's
    ``write_audit_entry`` contract: audit staging is always the caller's
    responsibility to commit, never a side transaction.
    """
    db.add(
        AuditEntry(
            actor_user_id=actor.user_id,
            actor_label=actor.label,
            subject=actor.subject,
            auth_source=actor.auth_source,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            details=details or {},
        )
    )


async def list_audit_entries(
    db: AsyncSession,
    *,
    requesting_user_id: int,
    is_admin: bool,
    target_user_id: int | None = None,
    limit: int = DEFAULT_AUDIT_LIMIT,
    before_id: int | None = None,
) -> list[AuditEntry]:
    """Return bounded, stably-ordered audit entries with ownership enforcement.

    - A non-admin caller may only read their own trail: ``target_user_id`` is
      forced to ``requesting_user_id`` regardless of what was requested.
    - An admin caller may read any user's trail (``target_user_id`` given) or
      the full team-wide trail (``target_user_id`` omitted).
    - ``limit`` is clamped between 1 and ``MAX_AUDIT_LIMIT``.
    - Results are ordered ``(created_at DESC, id DESC)`` — a strictly
      decreasing key — and ``before_id`` (an exclusive keyset cursor on
      ``id``) gives stable pagination that can't skip or repeat rows even
      when many entries share a ``created_at`` timestamp.
    """
    if limit < 1 or limit > MAX_AUDIT_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_AUDIT_LIMIT}, got: {limit}")

    if is_admin:
        effective_target = target_user_id
    else:
        if target_user_id is not None and target_user_id != requesting_user_id:
            raise AuditAuthorizationError("admin scope required to read another user's audit trail")
        effective_target = requesting_user_id

    statement = select(AuditEntry)
    if effective_target is not None:
        statement = statement.where(AuditEntry.actor_user_id == effective_target)
    if before_id is not None:
        statement = statement.where(AuditEntry.id < before_id)

    statement = statement.order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc()).limit(limit)
    result = await db.execute(statement)
    return list(result.scalars().all())
