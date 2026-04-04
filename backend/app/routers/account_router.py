"""Authenticated account profile endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import AuthenticatedPrincipal, get_authenticated_principal
from app.schemas import AccountCapabilities, AccountProfile
from app.services.db_service import NotFoundError, get_user

router = APIRouter(tags=["Account"])


@router.get("/me", response_model=AccountProfile)
async def get_account_profile(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> AccountProfile:
    """Return the authenticated user's profile and capability flags.

    Returns the current local user record with fields needed by the frontend
    to render signed-in account state and determine feature eligibility such
    as backup and sync.

    Raises 401 when no valid session is present (handled by
    ``get_authenticated_principal``).
    Raises 404 if the session maps to a local user id that no longer exists.
    """
    try:
        user = await get_user(session, principal.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return AccountProfile(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_admin=user.is_admin,
        # All authenticated local users are eligible for backup and sync.
        # This flag is reserved for future conditional logic (e.g. feature flags
        # or per-user settings) without changing the response shape.
        capabilities=AccountCapabilities(backup_enabled=True),
    )
