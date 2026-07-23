"""OIDC/JWT authentication for Worktime backend.

Validates Bearer JWTs issued by a configured OIDC provider (e.g. authentik,
Keycloak, ZITADEL) and auto-provisions local user records on first login.

The provider is configured via environment variables:
  OIDC_ISSUER_URL   — OIDC provider base URL
  OIDC_AUDIENCE     — Expected audience claim (optional)
  OIDC_JWKS_URI     — JWKS endpoint override (auto-discovered via /.well-known/openid-configuration if omitted)
  OIDC_ALGORITHMS   — Comma-separated list of accepted algorithms (default RS256)

Token subject claim (``sub``) is used as the stable external identity key.
``email`` and ``name``/``preferred_username`` claims are used for auto-provisioning.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from typing import Any

import httpx
import jwt
from jwt.exceptions import ExpiredSignatureError, PyJWTError
from jwt.types import Options

from app.config import settings
from app.services.db_service import ConflictError, create_user

logger = logging.getLogger(__name__)

# Fixed claims returned for DEV_AUTH_BYPASS_TOKEN (see decode_token below) —
# shaped like a real Keycloak-issued token so downstream code (username
# derivation, realm role extraction) needs no bypass-specific handling.
_DEV_BYPASS_CLAIMS: dict[str, Any] = {
    "sub": "dev-bypass-user",
    "preferred_username": "devuser",
    "name": "Dev User",
    "email": "dev@localhost",
    "email_verified": True,
    "realm_access": {"roles": ["admin"]},
}

# Pre-parsed at import time — avoids repeated string splitting on every request.
_OIDC_ALGORITHMS: list[str] = [a.strip() for a in settings.OIDC_ALGORITHMS.split(",") if a.strip()]
_OIDC_AUDIENCE: str | None = settings.OIDC_AUDIENCE or None
_OIDC_ISSUER: str | None = settings.OIDC_ISSUER_URL or None

# ---------------------------------------------------------------------------
# JWKS cache — fetched once per process lifetime, refreshed on key-not-found.
# ---------------------------------------------------------------------------

_jwks_lock = asyncio.Lock()
_jwks_cache: dict[str, Any] | None = None

_jwks_uri_lock = asyncio.Lock()
_jwks_uri_cache: str | None = None


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def _resolve_jwks_uri() -> str:
    """Return the JWKS URI, discovering it from the OIDC configuration document.

    Keycloak (and other providers) serve their signing keys at a
    provider-specific path, not the generic {issuer}/.well-known/jwks.json, so
    the URI is discovered from the standard OIDC discovery document instead of
    guessed. Discovery results are cached for the process lifetime.
    """
    global _jwks_uri_cache  # noqa: PLW0603
    if settings.OIDC_JWKS_URI:
        return settings.OIDC_JWKS_URI
    if not settings.OIDC_ISSUER_URL:
        raise OIDCTokenError("OIDC_ISSUER_URL is not configured")
    async with _jwks_uri_lock:
        if _jwks_uri_cache is not None:
            return _jwks_uri_cache
        base = settings.OIDC_ISSUER_URL.rstrip("/")
        try:
            async with _http_client() as client:
                resp = await client.get(f"{base}/.well-known/openid-configuration")
            resp.raise_for_status()
            _jwks_uri_cache = resp.json()["jwks_uri"]
            logger.info("Discovered JWKS URI: %s", _jwks_uri_cache)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise OIDCTokenError(f"OIDC discovery failed for {base}: {exc}") from exc
        return _jwks_uri_cache


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch the JWKS document from the OIDC provider (async, non-blocking)."""
    uri = await _resolve_jwks_uri()
    try:
        async with _http_client() as client:
            response = await client.get(uri)
        response.raise_for_status()
        return response.json()
    except OIDCTokenError:
        raise
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
# Periodic background refresh
# ---------------------------------------------------------------------------

_JWKS_REFRESH_INTERVAL_SECONDS = 3600


async def _periodic_jwks_refresh_loop() -> None:
    """Background loop that force-refreshes the JWKS cache periodically.

    Without this, the cache only refreshes reactively when a token's ``kid``
    isn't found in it (see ``decode_token``) — so a provider-side key
    rotation that keeps the same ``kid``, or a JWKS URI change, would go
    unnoticed until a process restart. Failures are logged and swallowed;
    the existing cached JWKS keeps serving requests, and the reactive
    refresh-on-miss path is unaffected by this loop failing.
    """
    while True:
        try:
            await asyncio.sleep(_JWKS_REFRESH_INTERVAL_SECONDS)
            await _get_jwks(force_refresh=True)
            logger.debug("Periodic JWKS refresh succeeded")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Periodic JWKS refresh failed (non-fatal)", exc_info=True)


def start_periodic_jwks_refresh() -> asyncio.Task[None]:
    """Start the background JWKS refresh loop and return its task for shutdown cancellation."""
    return asyncio.create_task(_periodic_jwks_refresh_loop())


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

class OIDCTokenError(Exception):
    """Raised when a JWT cannot be validated."""


def _find_signing_key(jwks_dict: dict[str, Any], kid: str | None) -> Any | None:
    """Return the JWKS key matching kid, or any key when kid is absent."""
    from jwt import PyJWKSet
    jwks_set = PyJWKSet.from_dict(jwks_dict)
    return next(
        (k for k in jwks_set.keys if kid is None or k.key_id == kid),
        None,
    )


async def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT Bearer token (async, non-blocking).

    Tries the cached JWKS first; on a key-not-found error, refreshes the JWKS
    once and retries to handle key rotation.

    Returns:
        The decoded JWT claims dict.

    Raises:
        OIDCTokenError: When the token is missing, expired, or otherwise invalid.
    """
    if settings.DEV_AUTH_BYPASS_TOKEN and hmac.compare_digest(token, settings.DEV_AUTH_BYPASS_TOKEN):
        return dict(_DEV_BYPASS_CLAIMS)

    options: Options = {
        "verify_aud": _OIDC_AUDIENCE is not None,
        "verify_iss": _OIDC_ISSUER is not None,
    }

    for attempt in range(2):
        try:
            jwks_dict = await _get_jwks(force_refresh=(attempt == 1))
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            signing_key = _find_signing_key(jwks_dict, kid)

            if signing_key is None:
                if attempt == 0:
                    logger.info("Signing key not found in cached JWKS — refreshing")
                    continue
                raise OIDCTokenError("Signing key not found in JWKS")

            return jwt.decode(
                token,
                signing_key.key,
                algorithms=_OIDC_ALGORITHMS,
                audience=_OIDC_AUDIENCE,
                issuer=_OIDC_ISSUER,
                options=options,
            )
        except ExpiredSignatureError as exc:
            raise OIDCTokenError("Token has expired") from exc
        except PyJWTError as exc:
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

    for attempt in range(2):
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
            return local_user
        except (IntegrityError, ConflictError):
            # Two possible races: a concurrent first-login for the *same*
            # subject won the INSERT, or a *different* new user claimed the
            # derived username between the availability check and the INSERT.
            await db_session.rollback()
            result = await db_session.execute(select(User).where(User.oidc_subject == subject))
            local_user = result.scalar_one_or_none()
            if local_user is not None:
                return local_user
            if attempt == 0:
                # Username collision with a different subject — the conflicting
                # row is now committed and visible, so re-deriving produces a
                # fresh candidate. Retry once instead of failing the login.
                logger.info(
                    "Username %r was claimed concurrently — retrying provisioning for subject %s",
                    username,
                    subject,
                )
                username = await _find_available_username(db_session, username, subject)
                continue
            raise

    raise RuntimeError(f"Could not provision local user for OIDC subject {subject!r}")
