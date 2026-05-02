"""OIDC/JWT authentication for Worktime backend.

Validates Bearer JWTs issued by a configured OIDC provider (e.g. authentik,
Keycloak, ZITADEL) and auto-provisions local user records on first login.

The provider is configured via environment variables:
  OIDC_ISSUER_URL   — OIDC provider base URL
  OIDC_AUDIENCE     — Expected audience claim (optional)
  OIDC_JWKS_URI     — JWKS endpoint override (defaults to {issuer}/jwks/)
  OIDC_ALGORITHMS   — Comma-separated list of accepted algorithms (default RS256)

Token subject claim (``sub``) is used as the stable external identity key.
``email`` and ``name``/``preferred_username`` claims are used for auto-provisioning.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.config import settings
from app.services.db_service import ConflictError, create_user

logger = logging.getLogger(__name__)

# Pre-parsed at import time — avoids repeated string splitting on every request.
_OIDC_ALGORITHMS: list[str] = [a.strip() for a in settings.OIDC_ALGORITHMS.split(",") if a.strip()]
_OIDC_AUDIENCE: str | None = settings.OIDC_AUDIENCE or None
_OIDC_ISSUER: str | None = settings.OIDC_ISSUER_URL or None

# ---------------------------------------------------------------------------
# JWKS cache — fetched once per process lifetime, refreshed on key-not-found.
# ---------------------------------------------------------------------------

_jwks_lock = asyncio.Lock()
_jwks_cache: dict[str, Any] | None = None


def _get_jwks_uri() -> str:
    """Return the JWKS URI for the configured OIDC issuer."""
    if settings.OIDC_JWKS_URI:
        return settings.OIDC_JWKS_URI
    base = settings.OIDC_ISSUER_URL.rstrip("/")
    return f"{base}/.well-known/jwks.json"


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch the JWKS document from the OIDC provider (async, non-blocking)."""
    uri = _get_jwks_uri()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(uri)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.error("Failed to fetch JWKS from %s: %s", uri, exc)
        raise


async def _get_jwks(*, force_refresh: bool = False) -> dict[str, Any]:
    """Return the cached JWKS document, fetching it on first call or when forced."""
    global _jwks_cache  # noqa: PLW0603
    async with _jwks_lock:
        if _jwks_cache is None or force_refresh:
            _jwks_cache = await _fetch_jwks()
        return _jwks_cache


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

class OIDCTokenError(Exception):
    """Raised when a JWT cannot be validated."""


async def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT Bearer token (async, non-blocking).

    Tries the cached JWKS first; on a key-not-found error, refreshes the JWKS
    once and retries to handle key rotation.

    Returns:
        The decoded JWT claims dict.

    Raises:
        OIDCTokenError: When the token is missing, expired, or otherwise invalid.
    """
    options: dict[str, Any] = {
        "verify_aud": _OIDC_AUDIENCE is not None,
        "verify_iss": _OIDC_ISSUER is not None,
    }

    for attempt in range(2):
        try:
            jwks = await _get_jwks(force_refresh=(attempt == 1))
            return jwt.decode(
                token,
                jwks,
                algorithms=_OIDC_ALGORITHMS,
                audience=_OIDC_AUDIENCE,
                issuer=_OIDC_ISSUER,
                options=options,
            )
        except ExpiredSignatureError as exc:
            raise OIDCTokenError("Token has expired") from exc
        except JWTError as exc:
            if attempt == 0 and "Unable to find a signing key" in str(exc):
                # Key may have been rotated; refresh JWKS and retry once.
                logger.info("Signing key not found in cached JWKS — refreshing")
                continue
            raise OIDCTokenError(f"Token validation failed: {exc}") from exc

    raise OIDCTokenError("Token validation failed after JWKS refresh")


# ---------------------------------------------------------------------------
# Local user provisioning
# ---------------------------------------------------------------------------

def _derive_username_and_display_name(claims: dict[str, Any], subject: str) -> tuple[str, str]:
    """Derive a local username and display name from OIDC token claims."""
    # Prefer preferred_username → email local part → sub prefix (explicit fallbacks)
    username = (claims.get("preferred_username") or "").strip()
    if not username:
        email = (claims.get("email") or "").strip()
        username = email.split("@")[0] if email else ""
    if not username:
        username = f"user-{subject[:8]}"

    display_name = (
        (claims.get("name") or "").strip()
        or (claims.get("display_name") or "").strip()
        or username
    )

    return username, display_name


_MAX_USERNAME_ATTEMPTS = 50


async def _find_available_username(db_session, base_username: str, subject: str) -> str:
    """Return a unique local username candidate for an OIDC identity."""
    from sqlalchemy import select

    from app.database.models import User

    candidate = base_username
    attempt = 0

    while attempt < _MAX_USERNAME_ATTEMPTS:
        result = await db_session.execute(select(User).where(User.username == candidate))
        if result.scalar_one_or_none() is None:
            return candidate

        attempt += 1
        # Progressively use more of the subject string as a disambiguation suffix.
        # Once the full subject is exhausted, append a numeric counter too.
        suffix = subject[:min(8 + attempt, len(subject))]
        candidate = f"{base_username}-{suffix}" if len(suffix) < len(subject) else f"{base_username}-{suffix}-{attempt}"

    raise RuntimeError(f"Could not find available username for {base_username!r} after {_MAX_USERNAME_ATTEMPTS} attempts")


async def get_or_create_local_user(subject: str, claims: dict[str, Any], db_session: Any):
    """Return the local user for an OIDC subject, auto-provisioning when missing.

    Looks up by ``oidc_subject`` first. If not found, derives a username and
    display name from the token claims and creates a new local user row.
    """
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    from app.database.models import User
    from app.schemas import UserCreate

    result = await db_session.execute(select(User).where(User.oidc_subject == subject))
    local_user = result.scalar_one_or_none()
    if local_user is not None:
        return local_user

    username, display_name = _derive_username_and_display_name(claims, subject)
    username = await _find_available_username(db_session, username, subject)

    try:
        local_user = await create_user(
            db_session,
            UserCreate(
                username=username,
                display_name=display_name,
                settings={},
            ),
            oidc_subject=subject,
        )
        logger.info(
            "Auto-provisioned local Worktime user %r for OIDC subject %s",
            username,
            subject,
        )
    except (IntegrityError, ConflictError):
        # Race condition: concurrent first-login for the same subject.
        await db_session.rollback()
        result = await db_session.execute(select(User).where(User.oidc_subject == subject))
        local_user = result.scalar_one_or_none()
        if local_user is None:
            raise

    return local_user
