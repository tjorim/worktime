"""Service layer for managed, database-backed integration clients (issue #1054).

Replaces the long-lived static-token map previously parsed once from
``WORKTIME_MCP_INTEGRATION_KEYS`` at process startup. Each ``IntegrationClient``
row is a revocable, rotatable, rate-limited credential bound to one Worktime
user, mirroring the ``AccessToken`` pattern already used for personal access
tokens (``app.services.access_token_service``) but scoped for
automation/integration callers such as the MCP server.
"""

from __future__ import annotations

import hmac
import secrets
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.db import AuditActor, write_audit_entry
from app.config import settings
from app.database.models import IntegrationClient, User
from app.services.db_service import NotFoundError

KEY_PREFIX = "wtic_"
DEFAULT_SCOPES = ("worktime:mcp",)
ADMIN_SCOPE = "worktime:admin"
MCP_SCOPE = "worktime:mcp"
DEFAULT_RATE_LIMIT_PER_MINUTE = 120
MAX_RATE_LIMIT_PER_MINUTE = 6000
_KEY_PREVIEW_LENGTH = 4
_LAST_USED_UPDATE_INTERVAL = timedelta(minutes=15)


class RateLimitExceededError(Exception):
    """Raised when an integration client exceeds its configured per-minute rate limit."""


def _hash_integration_key_with_secret(raw_key: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), raw_key.encode("utf-8"), sha256).hexdigest()


def hash_integration_key(raw_key: str) -> str:
    """Hash a raw integration-client key for storage/lookup.

    Server-generated high-entropy tokens (``secrets.token_urlsafe``), not user
    passwords — HMAC-SHA256 with a server-side secret is correct: it adds
    defense-in-depth against a stolen database dump without materially
    changing the (already infeasible) brute-force cost of the raw key.
    """
    secret = settings.resolved_integration_key_hash_secret()
    return _hash_integration_key_with_secret(raw_key, secret)


def integration_key_hash_candidates(raw_key: str) -> list[str]:
    """Return current then optional previous-secret hashes for bounded rotation."""
    candidates = [hash_integration_key(raw_key)]
    previous = settings.INTEGRATION_KEY_HASH_SECRET_PREVIOUS.strip()
    if previous:
        previous_hash = _hash_integration_key_with_secret(raw_key, previous)
        if previous_hash not in candidates:
            candidates.append(previous_hash)
    return candidates


def _validate_scopes(scopes: list[str]) -> list[str]:
    deduped = list(dict.fromkeys(scopes))
    if not deduped:
        raise ValueError("at least one scope is required")
    for scope in deduped:
        if scope not in (MCP_SCOPE, ADMIN_SCOPE):
            raise ValueError(f"unknown integration-client scope: {scope!r}")
    return deduped


async def create_integration_client(
    session: AsyncSession,
    user_id: int,
    *,
    name: str,
    scopes: list[str] | None = None,
    rate_limit_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE,
    actor: AuditActor | None = None,
) -> tuple[IntegrationClient, str]:
    """Create an integration client and return it alongside the raw key (shown only once).

    Callers are responsible for authorization — specifically, that granting
    ``worktime:admin`` requires the acting principal to already be an admin
    (see ``app.routers.integration_clients``), so a credential can never mint
    another credential with broader privileges than its own caller.
    When *actor* is supplied the creation is recorded in the transactional
    audit trail (same DB transaction as the credential row).
    """
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("user not found")
    if rate_limit_per_minute < 1 or rate_limit_per_minute > MAX_RATE_LIMIT_PER_MINUTE:
        raise ValueError(f"rate_limit_per_minute must be between 1 and {MAX_RATE_LIMIT_PER_MINUTE}")

    validated_scopes = _validate_scopes(list(scopes) if scopes is not None else list(DEFAULT_SCOPES))
    raw_key = KEY_PREFIX + secrets.token_urlsafe(32)
    client = IntegrationClient(
        user_id=user_id,
        name=name,
        key_hash=hash_integration_key(raw_key),
        key_preview=raw_key[-_KEY_PREVIEW_LENGTH:],
        scopes=validated_scopes,
        rate_limit_per_minute=rate_limit_per_minute,
    )
    session.add(client)
    await session.flush()
    effective_actor = actor or AuditActor(
        user_id=user_id, label=f"user:{user_id}", auth_source="keycloak_user", subject=str(user_id)
    )
    await write_audit_entry(
        session,
        actor=effective_actor,
        action="integration_client_created",
        resource_type="integration_client",
        resource_id=str(client.id),
        details={"name": name, "scopes": validated_scopes, "rate_limit_per_minute": rate_limit_per_minute},
    )
    await session.commit()
    await session.refresh(client)
    return client, raw_key


async def list_integration_clients_for_user(session: AsyncSession, user_id: int) -> list[IntegrationClient]:
    result = await session.execute(
        select(IntegrationClient)
        .where(IntegrationClient.user_id == user_id)
        .order_by(IntegrationClient.created_at.desc())
    )
    return list(result.scalars().all())


async def get_integration_client_for_user(session: AsyncSession, user_id: int, client_id: int) -> IntegrationClient:
    client = await session.get(IntegrationClient, client_id)
    if client is None or client.user_id != user_id:
        raise NotFoundError("integration client not found")
    return client


async def revoke_integration_client(
    session: AsyncSession, user_id: int, client_id: int, *, actor: AuditActor | None = None
) -> IntegrationClient:
    """Disable a client (revocable, not deleted, so audit history stays intact)."""
    client = await get_integration_client_for_user(session, user_id, client_id)
    client.is_active = False
    client.revoked_at = datetime.now(UTC)
    session.add(client)
    effective_actor = actor or AuditActor(
        user_id=user_id, label=f"user:{user_id}", auth_source="keycloak_user", subject=str(user_id)
    )
    await write_audit_entry(
        session,
        actor=effective_actor,
        action="integration_client_revoked",
        resource_type="integration_client",
        resource_id=str(client.id),
        details={"name": client.name},
    )
    await session.commit()
    await session.refresh(client)
    return client


async def rotate_integration_client(
    session: AsyncSession, user_id: int, client_id: int, *, actor: AuditActor | None = None
) -> tuple[IntegrationClient, str]:
    """Replace a client's key in place, immediately invalidating the old one."""
    client = await get_integration_client_for_user(session, user_id, client_id)
    if not client.is_active or client.revoked_at is not None:
        raise ValueError("Cannot rotate a revoked or inactive integration client")
    raw_key = KEY_PREFIX + secrets.token_urlsafe(32)
    client.key_hash = hash_integration_key(raw_key)
    client.key_preview = raw_key[-_KEY_PREVIEW_LENGTH:]
    client.is_active = True
    client.revoked_at = None
    session.add(client)
    effective_actor = actor or AuditActor(
        user_id=user_id, label=f"user:{user_id}", auth_source="keycloak_user", subject=str(user_id)
    )
    await write_audit_entry(
        session,
        actor=effective_actor,
        action="integration_client_rotated",
        resource_type="integration_client",
        resource_id=str(client.id),
        details={"name": client.name},
    )
    await session.commit()
    await session.refresh(client)
    return client, raw_key


async def get_active_integration_client_by_key(session: AsyncSession, raw_key: str) -> IntegrationClient | None:
    """Look up an active client by raw key. Returns None for unknown/inactive/revoked keys."""
    current_hash, *fallback_hashes = integration_key_hash_candidates(raw_key)
    result = await session.execute(
        select(IntegrationClient).where(IntegrationClient.key_hash.in_([current_hash, *fallback_hashes]))
    )
    client = result.scalar_one_or_none()
    if client is None or not client.is_active:
        return None
    if client.key_hash != current_hash:
        client.key_hash = current_hash
        await session.commit()
        await session.refresh(client)
    return client


async def record_integration_client_usage(session: AsyncSession, client: IntegrationClient) -> None:
    """Update last_used_at, throttled to avoid a write on every single call."""
    now = datetime.now(UTC)
    last_used_at = client.last_used_at
    if last_used_at is not None:
        if last_used_at.tzinfo is None:
            last_used_at = last_used_at.replace(tzinfo=UTC)
        if now - last_used_at < _LAST_USED_UPDATE_INTERVAL:
            return
    client.last_used_at = now
    session.add(client)
    await session.commit()


async def enforce_integration_client_rate_limit(session: AsyncSession, client_id: int) -> None:
    """Consume one database-backed fixed-window request across all workers."""
    client = await session.scalar(select(IntegrationClient).where(IntegrationClient.id == client_id).with_for_update())
    if client is None:
        raise RateLimitExceededError("integration client no longer exists")
    now = datetime.now(UTC)
    started = client.rate_limit_window_started_at
    if started is not None and started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    if started is None or now - started >= timedelta(minutes=1):
        client.rate_limit_window_started_at = now
        client.rate_limit_window_count = 1
    elif client.rate_limit_window_count >= client.rate_limit_per_minute:
        rate_limit = client.rate_limit_per_minute
        await session.rollback()
        raise RateLimitExceededError(
            f"integration client {client_id!r} exceeded its rate limit of {rate_limit} requests/minute"
        )
    else:
        client.rate_limit_window_count += 1
    await session.commit()
