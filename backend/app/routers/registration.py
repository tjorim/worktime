"""Self-serve user registration endpoint.

Provides a public ``POST /users/register`` route for pre-creating local user
accounts.  User authentication and identity management are handled by the
configured OIDC provider (e.g. authentik, Keycloak, ZITADEL).

Pre-provisioned users created via this endpoint are NOT automatically linked to
an OIDC login.  On first login the backend provisions a new local user record
from the token claims (see ``app.config.oidc_config``), regardless of any
pre-existing rows with a matching username.  Use this endpoint only when a local
record must exist before the user's first sign-in and the admin will manually
associate the ``oidc_subject`` out-of-band.
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
    is handled by the OIDC provider.  The ``oidc_subject`` is left NULL and is
    NOT populated automatically — pre-provisioned users are not auto-linked to
    a matching OIDC login.
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
