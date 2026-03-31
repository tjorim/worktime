"""Authentication helpers for protected API endpoints.

Session verification is delegated to the SuperTokens SDK.  The helper
dependencies exposed here (``get_authenticated_principal``,
``get_authenticated_user_id``, …) extract identity information from the
verified session so that existing endpoint code does not need to change.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from supertokens_python.recipe.session import SessionContainer
from supertokens_python.recipe.session.framework.fastapi import verify_session


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    user_id: int
    is_admin: bool = False


def get_authenticated_principal(
    session: SessionContainer = Depends(verify_session()),
) -> AuthenticatedPrincipal:
    """Extract authenticated principal data from a verified SuperTokens session.

    Reads ``local_user_id`` and ``is_admin`` custom claims that are stored in
    the access-token payload during session creation (see
    ``app.config.supertokens_config``).
    """
    payload = session.get_access_token_payload()
    local_user_id = payload.get("local_user_id")
    if local_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session missing local user mapping",
        )

    return AuthenticatedPrincipal(
        user_id=int(local_user_id),
        is_admin=bool(payload.get("is_admin", False)),
    )


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

