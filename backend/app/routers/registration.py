"""Self-serve user registration endpoint.

Provides a public ``POST /users/register`` route as a lightweight fallback for
pre-creating local user accounts.  User authentication and identity management
are handled by the configured OIDC provider (e.g. authentik, Keycloak, ZITADEL).

On first OIDC login the backend auto-provisions a local user record from the
token claims (see ``app.config.oidc_config``).  This endpoint is retained for
administrative pre-provisioning scenarios where the local record should exist
before the user's first sign-in.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.schemas import UserCreate, UserRead, UserRegister
from app.services.db_service import ConflictError, create_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Registration"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(
    payload: UserRegister,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    """Pre-register a local user account.

    Creates a local database user row.  No password is stored; authentication
    is handled by the OIDC provider.  The ``oidc_subject`` for this row will be
    populated automatically on the user's first OIDC login.
    """
    user_create = UserCreate(
        username=payload.username,
        display_name=payload.display_name or payload.username,
        settings={},
    )
    try:
        user = await create_user(session, user_create)
    except ConflictError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error

    return UserRead.model_validate(user, from_attributes=True)
