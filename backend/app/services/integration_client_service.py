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
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


def hash_integration_key(raw_key: str) -> str:
    """Hash a raw integration-client key for storage/lookup.

    Server-generated high-entropy tokens (``secrets.token_urlsafe``), not user
    passwords — HMAC-SHA256 with a server-side secret is correct: it adds
    defense-in-depth against a stolen database dump without materially
    changing the (already infeasible) brute-force cost of the raw key.
    """
    secret = settings.resolved_integration_key_hash_secret()
    return hmac.new(secret.encode("utf-8"), raw_key.encode("utf-8"), sha256).hexdigest()


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
) -> tuple[IntegrationClient, str]:
    """Create an integration client and return it alongside the raw key (shown only once).

    Callers are responsible for authorization — specifically, that granting
    ``worktime:admin`` requires the acting principal to already be an admin
    (see ``app.routers.integration_clients``), so a credential can never mint
    another credential with broader privileges than its own caller.
    """
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("user not found")
    if rate_limit_per_minute < 1 or rate_limit_per_minute > MAX_RATE_LIMIT_PER_MINUTE:
        raise ValueError(
            f"rate_limit_per_minute must be between 1 and {MAX_RATE_LIMIT_PER_MINUTE}"
        )

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
    await session.commit()
    await session.refresh(client)
    return client, raw_key


async def list_integration_clients_for_user(
    session: AsyncSession, user_id: int
) -> list[IntegrationClient]:
    result = await session.execute(
        select(IntegrationClient)
        .where(IntegrationClient.user_id == user_id)
        .order_by(IntegrationClient.created_at.desc())
    )
    return list(result.scalars().all())


async def get_integration_client_for_user(
    session: AsyncSession, user_id: int, client_id: int
) -> IntegrationClient:
    client = await session.get(IntegrationClient, client_id)
    if client is None or client.user_id != user_id:
        raise NotFoundError("integration client not found")
    return client


async def revoke_integration_client(session: AsyncSession, user_id: int, client_id: int) -> IntegrationClient:
    """Disable a client (revocable, not deleted, so audit history stays intact)."""
    client = await get_integration_client_for_user(session, user_id, client_id)
    client.is_active = False
    client.revoked_at = datetime.now(UTC)
    session.add(client)
    await session.commit()
    await session.refresh(client)
    return client


async def rotate_integration_client(
    session: AsyncSession, user_id: int, client_id: int
) -> tuple[IntegrationClient, str]:
    """Replace a client's key in place, immediately invalidating the old one."""
    client = await get_integration_client_for_user(session, user_id, client_id)
    raw_key = KEY_PREFIX + secrets.token_urlsafe(32)
    client.key_hash = hash_integration_key(raw_key)
    client.key_preview = raw_key[-_KEY_PREVIEW_LENGTH:]
    client.is_active = True
    client.revoked_at = None
    session.add(client)
    await session.commit()
    await session.refresh(client)
    return client, raw_key


async def get_active_integration_client_by_key(
    session: AsyncSession, raw_key: str
) -> IntegrationClient | None:
    """Look up an active client by raw key. Returns None for unknown/inactive/revoked keys."""
    result = await session.execute(
        select(IntegrationClient).where(IntegrationClient.key_hash == hash_integration_key(raw_key))
    )
    client = result.scalar_one_or_none()
    if client is None or not client.is_active:
        return None
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


# ---------------------------------------------------------------------------
# Per-client rate limiting (in-process sliding window)
# ---------------------------------------------------------------------------
#
# Deliberately in-process rather than DB- or Redis-backed: Worktime's MCP
# server runs as a single process (see docs/integrations/LOCAL_MCP_SERVER.md),
# so a per-process window is sufficient defense-in-depth against a
# misbehaving/compromised integration credential without adding an
# infrastructure dependency. A multi-process deployment would need a shared
# store instead — noted as a follow-up, not a requirement for this issue.
_WINDOW_SECONDS = 60.0
_usage_windows: dict[int, deque[float]] = {}


def enforce_integration_client_rate_limit(client_id: int, rate_limit_per_minute: int) -> None:
    """Raise RateLimitExceededError once *client_id* exceeds its per-minute budget.

    Takes the client id and configured limit directly (rather than an ORM
    instance) so callers that only have the verified token's claims — as
    ``WorktimeMcpBackend.resolve_context`` does, once per tool call — can
    enforce the limit without an extra DB round-trip. Resets naturally as old
    timestamps age out of the window — no background task required.
    """
    now = time.monotonic()
    window = _usage_windows.setdefault(client_id, deque())
    cutoff = now - _WINDOW_SECONDS
    while window and window[0] < cutoff:
        window.popleft()

    if len(window) >= rate_limit_per_minute:
        raise RateLimitExceededError(
            f"integration client {client_id!r} exceeded its rate limit of "
            f"{rate_limit_per_minute} requests/minute"
        )
    window.append(now)


def reset_rate_limit_state() -> None:
    """Clear all in-process rate-limit windows. Test-only helper."""
    _usage_windows.clear()
