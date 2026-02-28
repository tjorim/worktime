"""REST API endpoints for database-backed user resources."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from app.database.engine import get_session
from app.models.db_schemas import UserCreate, UserListResponse, UserRead, UserUpdate
from app.services.db_service import (
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
def create_user_endpoint(
    payload: UserCreate,
    session: Session = Depends(get_session),
) -> UserRead:
    try:
        user = create_user(session, payload)
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    return UserRead.model_validate(user, from_attributes=True)


@router.get("/", response_model=UserListResponse)
def list_users_endpoint(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> UserListResponse:
    try:
        users = list_users(session, is_admin=True)
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error

    items = users[offset : offset + limit]
    return UserListResponse(
        items=[UserRead.model_validate(item, from_attributes=True) for item in items],
        total=len(users),
    )


@router.get("/{user_id}", response_model=UserRead)
def get_user_endpoint(user_id: int, session: Session = Depends(get_session)) -> UserRead:
    try:
        user = get_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return UserRead.model_validate(user, from_attributes=True)


@router.get("/by-username/{username}", response_model=UserRead)
def get_user_by_username_endpoint(
    username: str,
    session: Session = Depends(get_session),
) -> UserRead:
    user = get_user_by_username(session, username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    return UserRead.model_validate(user, from_attributes=True)


@router.put("/{user_id}", response_model=UserRead)
def update_user_endpoint(
    user_id: int,
    payload: UserUpdate,
    session: Session = Depends(get_session),
) -> UserRead:
    try:
        user = update_user(session, user_id, payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return UserRead.model_validate(user, from_attributes=True)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_endpoint(user_id: int, session: Session = Depends(get_session)) -> Response:
    try:
        delete_user(session, user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
