"""Self-serve user registration endpoint.

Provides a public ``POST /users/register`` route that is the only
supported self-serve registration path for non-admin users.  It creates
both a SuperTokens email-password identity and a local database user row in
a single atomic flow.  If the local DB write fails the SuperTokens identity
is rolled back so no orphaned auth state is left behind.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from supertokens_python.asyncio import delete_user as st_delete_user
from supertokens_python.recipe.emailpassword.asyncio import sign_up as st_sign_up
from supertokens_python.recipe.emailpassword.interfaces import (
    EmailAlreadyExistsError as STEmailAlreadyExistsError,
)
from supertokens_python.recipe.emailpassword.interfaces import (
    SignUpOkResult as STSignUpOkResult,
)

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
    """Register a new user account.

    Creates both a SuperTokens email-password identity and a local database
    user row.  This is the only self-serve registration path for non-admin
    users.

    The SuperTokens email identifier follows the ``{username}@worktime.local``
    convention (or the raw value when the username already contains ``@``),
    matching the convention used by the admin endpoint and the migration
    script.

    On any failure after the SuperTokens identity has been created the
    SuperTokens user is deleted to prevent orphaned auth state.
    """
    st_email = (
        payload.username
        if "@" in payload.username
        else f"{payload.username}@worktime.local"
    )

    st_result = await st_sign_up(tenant_id="public", email=st_email, password=payload.password)
    if isinstance(st_result, STEmailAlreadyExistsError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="username already exists",
        )
    if not isinstance(st_result, STSignUpOkResult):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SuperTokens sign-up failed unexpectedly",
        )

    st_user_id = st_result.user.id
    user_create = UserCreate(
        username=payload.username,
        display_name=payload.display_name or payload.username,
        settings={},
        password=payload.password,
    )
    try:
        user = await create_user(session, user_create, supertokens_user_id=st_user_id)
    except ConflictError as error:
        try:
            await st_delete_user(st_user_id)
        except Exception as rollback_error:
            logger.error(
                "Failed to roll back SuperTokens user %s after ConflictError: %s",
                st_user_id,
                rollback_error,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
    except Exception as exc:
        try:
            await st_delete_user(st_user_id)
        except Exception as rollback_error:
            logger.error(
                "Failed to roll back SuperTokens user %s after unexpected error: %s",
                st_user_id,
                rollback_error,
            )
        logger.error("Unexpected error during registration for username %r: %s", payload.username, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed unexpectedly",
        ) from exc

    return UserRead.model_validate(user, from_attributes=True)
