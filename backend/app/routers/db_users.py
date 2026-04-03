"""REST API endpoints for database-backed user resources."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from supertokens_python.asyncio import delete_user as st_delete_user
from supertokens_python.recipe.emailpassword.asyncio import (
    sign_up as st_sign_up,
    update_email_or_password as st_update_email_or_password,
)
from supertokens_python.recipe.emailpassword.interfaces import (
    EmailAlreadyExistsError as STEmailAlreadyExistsError,
)
from supertokens_python.recipe.emailpassword.interfaces import (
    SignUpOkResult as STSignUpOkResult,
)
from supertokens_python.recipe.emailpassword.interfaces import (
    UnknownUserIdError as STUnknownUserIdError,
)
from supertokens_python.recipe.emailpassword.interfaces import (
    UpdateEmailOrPasswordOkResult as STUpdateEmailOrPasswordOkResult,
)
from supertokens_python.types import RecipeUserId

from app.database.engine import get_session
from app.routers.auth import (
    AuthenticatedPrincipal,
    get_authenticated_principal,
    require_user_or_admin_match,
)
from app.schemas import UserCreate, UserListResponse, UserRead, UserUpdate
from app.services.db_service import (
    MAX_USER_LIST_LIMIT,
    ConflictError,
    NotFoundError,
    ValidationError,
    create_user,
    delete_user,
    get_user,
    get_user_by_username,
    list_users,
    update_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/db/users", tags=["Database Users"])


def _username_to_st_email(username: str) -> str:
    """Map a local username to the SuperTokens email-password identifier."""
    return username if "@" in username else f"{username}@worktime.local"


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    payload: UserCreate,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Register the user in SuperTokens first. Uses username as the email
    # identifier, matching the convention used by the migration script.
    st_email = _username_to_st_email(payload.username)
    st_result = await st_sign_up(tenant_id="public", email=st_email, password=payload.password)
    if isinstance(st_result, STEmailAlreadyExistsError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username already exists")
    if not isinstance(st_result, STSignUpOkResult):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SuperTokens sign-up failed unexpectedly",
        )

    st_user_id = st_result.user.id
    try:
        user = await create_user(session, payload, supertokens_user_id=st_user_id)
    except ConflictError as error:
        try:
            await st_delete_user(st_user_id)
        except Exception as rollback_error:
            logger.error(
                "Failed to roll back SuperTokens user %s after ConflictError: %s",
                st_user_id,
                rollback_error,
            )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except Exception:
        try:
            await st_delete_user(st_user_id)
        except Exception as rollback_error:
            logger.error(
                "Failed to roll back SuperTokens user %s after unexpected error: %s",
                st_user_id,
                rollback_error,
            )
        raise

    return UserRead.model_validate(user, from_attributes=True)


@router.get("/", response_model=UserListResponse)
async def list_users_endpoint(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=MAX_USER_LIST_LIMIT),
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserListResponse:
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    try:
        users, total = await list_users(session, offset=offset, limit=limit)
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return UserListResponse(
        items=[UserRead.model_validate(item, from_attributes=True) for item in users],
        total=total,
    )


@router.get("/{user_id}", response_model=UserRead)
async def get_user_endpoint(
    user_id: int,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    require_user_or_admin_match(user_id, principal)
    try:
        user = await get_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return UserRead.model_validate(user, from_attributes=True)


@router.get("/by-username/{username}", response_model=UserRead)
async def get_user_by_username_endpoint(
    username: str,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    user = await get_user_by_username(session, username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    require_user_or_admin_match(user.id, principal)
    return UserRead.model_validate(user, from_attributes=True)


@router.put("/{user_id}", response_model=UserRead)
async def update_user_endpoint(
    user_id: int,
    payload: UserUpdate,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    require_user_or_admin_match(user_id, principal)
    try:
        current_user = await get_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    previous_username = current_user.username
    next_username = payload.username or previous_username
    username_changed = next_username != previous_username

    if username_changed:
        st_result = await st_update_email_or_password(
            recipe_user_id=RecipeUserId(current_user.supertokens_user_id),
            email=_username_to_st_email(next_username),
        )
        if isinstance(st_result, STEmailAlreadyExistsError):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username already exists")
        if isinstance(st_result, STUnknownUserIdError):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Authentication identity is missing for this user",
            )
        if not isinstance(st_result, STUpdateEmailOrPasswordOkResult):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="SuperTokens user update failed unexpectedly",
            )

    try:
        user = await update_user(session, user_id, payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except Exception:
        if username_changed:
            try:
                await st_update_email_or_password(
                    recipe_user_id=RecipeUserId(current_user.supertokens_user_id),
                    email=_username_to_st_email(previous_username),
                )
            except Exception as rollback_error:
                logger.error(
                    "Failed to roll back SuperTokens email for user %s after local update error: %s",
                    current_user.supertokens_user_id,
                    rollback_error,
                )
        raise

    return UserRead.model_validate(user, from_attributes=True)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_endpoint(
    user_id: int,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    require_user_or_admin_match(user_id, principal)
    try:
        user = await get_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    st_delete_result = await st_delete_user(user.supertokens_user_id)
    if not st_delete_result:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication identity could not be deleted",
        )

    try:
        await delete_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
