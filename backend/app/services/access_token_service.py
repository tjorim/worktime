"""Service layer for personal access tokens (e.g. the Pebble companion app)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AccessToken
from app.schemas import AccessTokenCreate
from app.services.db_service import NotFoundError

TOKEN_PREFIX = "wtpat_"
_TOKEN_PREVIEW_LENGTH = 4
_LAST_USED_UPDATE_INTERVAL = timedelta(minutes=15)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def create_access_token(
    session: AsyncSession, user_id: int, payload: AccessTokenCreate
) -> tuple[AccessToken, str]:
    """Create a token and return it alongside the raw value (shown only once)."""
    raw_token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    token = AccessToken(
        user_id=user_id,
        name=payload.name,
        token_hash=_hash_token(raw_token),
        token_preview=raw_token[-_TOKEN_PREVIEW_LENGTH:],
        scopes=list(payload.scopes),
    )
    session.add(token)
    await session.commit()
    await session.refresh(token)
    return token, raw_token


async def list_access_tokens_for_user(session: AsyncSession, user_id: int) -> list[AccessToken]:
    result = await session.execute(
        select(AccessToken)
        .where(AccessToken.user_id == user_id)
        .order_by(AccessToken.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_access_token(session: AsyncSession, user_id: int, token_id: str) -> None:
    token = await session.get(AccessToken, token_id)
    if token is None or token.user_id != user_id:
        raise NotFoundError("access token not found")
    await session.delete(token)
    await session.commit()


async def authenticate_access_token(session: AsyncSession, raw_token: str) -> AccessToken | None:
    """Look up a token by its hash and record last-used time. Returns None if unknown/revoked."""
    result = await session.execute(
        select(AccessToken).where(AccessToken.token_hash == _hash_token(raw_token))
    )
    token = result.scalar_one_or_none()
    if token is None:
        return None
    now = datetime.now(UTC)
    last_used_at = token.last_used_at
    if last_used_at is not None:
        if last_used_at.tzinfo is None:
            last_used_at = last_used_at.replace(tzinfo=UTC)
        if now - last_used_at < _LAST_USED_UPDATE_INTERVAL:
            return token
    token.last_used_at = now
    await session.commit()
    return token
