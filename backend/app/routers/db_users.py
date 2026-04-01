"""REST API endpoints for database-backed user resources."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from supertokens_python.recipe.emailpassword.asyncio import sign_up as st_sign_up
from supertokens_python.recipe.emailpassword.interfaces import (
    EmailAlreadyExistsError as STEmailAlreadyExistsError,
    SignUpOkResult as STSignUpOkResult,
)

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

router = APIRouter(prefix="/v1/db/users", tags=["Database Users"])


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
    st_email = (
        payload.username
        if "@" in payload.username
        else f"{payload.username}@worktime.local"
    )
    st_result = await st_sign_up(tenant_id="public", email=st_email, password=payload.password)
    if isinstance(st_result, STEmailAlreadyExistsError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username already exists")
    if not isinstance(st_result, STSignUpOkResult):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SuperTokens sign-up failed unexpectedly",
        )

    try:
        user = await create_user(session, payload, supertokens_user_id=st_result.user.id)
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

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
        user = await update_user(session, user_id, payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return UserRead.model_validate(user, from_attributes=True)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_endpoint(
    user_id: int,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    require_user_or_admin_match(user_id, principal)
    try:
        await delete_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
