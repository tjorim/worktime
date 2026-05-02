"""Authentication helpers for protected API endpoints.

Session verification is delegated to the OIDC JWT validation layer.  The
helper dependencies exposed here (``get_authenticated_principal``,
``get_authenticated_user_id``, …) extract identity information from the
validated Bearer JWT so that existing endpoint code does not need to change.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.config.oidc_config import OIDCTokenError, decode_token, get_or_create_local_user
from app.database.engine import get_session

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)
_ADMIN_USERNAMES: frozenset[str] = frozenset(u.strip() for u in settings.ADMIN_USERNAMES.split(",") if u.strip())


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    user_id: int
    is_admin: bool = False


async def get_authenticated_principal(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedPrincipal:
    """Validate a Bearer JWT and return the authenticated principal.

    Decodes the OIDC access token, looks up (or auto-provisions) the local
    user record by the token ``sub`` claim, and derives ``is_admin`` from the
    configured ``ADMIN_USERNAMES`` list.
    """
    token = credentials.credentials
    try:
        claims = await decode_token(token)
    except OIDCTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing or empty subject claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        local_user = await get_or_create_local_user(subject, claims, session)
    except Exception as exc:
        logger.exception("Failed to resolve local user for subject %s", subject)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error",
        ) from exc

    is_admin = local_user.username in _ADMIN_USERNAMES

    return AuthenticatedPrincipal(user_id=local_user.id, is_admin=is_admin)


def get_authenticated_user_id(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
) -> int:
    """Backward-compatible dependency returning only the authenticated user ID."""
    return principal.user_id


def require_user_match(user_id: int, authenticated_user_id: int) -> None:
    """Enforce that request user_id matches the authenticated user."""
    if user_id != authenticated_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_user_or_admin_match(user_id: int, principal: AuthenticatedPrincipal) -> None:
    """Allow access to the same user or any user when the principal is admin."""
    if principal.is_admin:
        return
    if principal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

