"""REST API endpoints for database-backed user resources."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import (
    AuthenticatedPrincipal,
    get_authenticated_principal,
    require_user_or_admin_match,
)
from app.schemas import (
    GanttTaskSyncRead,
    LabelSyncRead,
    TaskSyncRead,
    TemplateSyncRead,
    TimeOffEntrySyncRead,
    UserCreate,
    UserDataExport,
    UserExportSummary,
    UserListResponse,
    UserRead,
    UserUpdate,
    WorkLocationSyncRead,
)
from app.services.db_service import (
    MAX_USER_LIST_LIMIT,
    ConflictError,
    NotFoundError,
    ValidationError,
    create_user,
    delete_user_uncommitted,
    get_user,
    get_user_by_username,
    get_user_export_data,
    list_users,
    update_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    payload: UserCreate,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    """Admin-only endpoint to pre-create a local user record.

    The ``oidc_subject`` is left unset; it will be populated when the user first
    authenticates via OIDC.
    """
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    try:
        user = await create_user(session, payload)
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


@router.get("/{user_id}/export", response_model=UserDataExport)
async def export_user_endpoint(
    user_id: int,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    require_user_or_admin_match(user_id, principal)
    try:
        (
            user,
            labels,
            tasks,
            templates,
            work_locations,
            gantt_tasks,
            time_off_entries,
            preferences,
        ) = await get_user_export_data(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    response = UserDataExport(
        exported_at=datetime.now(UTC),
        user=UserExportSummary.model_validate(user, from_attributes=True),
        time_tracking_labels=[LabelSyncRead.model_validate(item, from_attributes=True) for item in labels],
        time_tracking_tasks=[TaskSyncRead.model_validate(item, from_attributes=True) for item in tasks],
        time_tracking_templates=[
            TemplateSyncRead.model_validate(item, from_attributes=True) for item in templates
        ],
        work_locations=[
            WorkLocationSyncRead.model_validate(item, from_attributes=True) for item in work_locations
        ],
        gantt_tasks=[GanttTaskSyncRead.model_validate(item, from_attributes=True) for item in gantt_tasks],
        time_off_entries=[
            TimeOffEntrySyncRead.model_validate(item, from_attributes=True) for item in time_off_entries
        ],
        preferences=preferences,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"Content-Disposition": 'attachment; filename="worktime-export.json"'},
    )


@router.get("/by-username/{username}", response_model=UserRead)
async def get_user_by_username_endpoint(
    username: str,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    user = await get_user_by_username(session, username)
    # Return 404 for both "does not exist" and "not yours": a 403 here would
    # let any authenticated caller enumerate which usernames are taken.
    if user is None or (not principal.is_admin and user.id != principal.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

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
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return UserRead.model_validate(user, from_attributes=True)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_endpoint(
    user_id: int,
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if principal.is_admin and principal.user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot delete their own account via this endpoint.",
        )

    require_user_or_admin_match(user_id, principal)

    try:
        async with session.begin():
            await delete_user_uncommitted(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
