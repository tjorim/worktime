"""Authentication endpoints: login and current-user."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
import jwt

from app.api.auth import AuthenticatedPrincipal, get_authenticated_principal
from app.config import settings
from app.database.engine import get_session
from app.models.db_schemas import LoginRequest, TokenResponse, UserRead
from app.services.db_service import NotFoundError, ValidationError, authenticate_user, get_user

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])

_TOKEN_LIFETIME_SECONDS = 24 * 3600


@router.post("/token", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> TokenResponse:
    try:
        user = authenticate_user(session, payload.username, payload.password)
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    exp = datetime.now(timezone.utc) + timedelta(seconds=_TOKEN_LIFETIME_SECONDS)
    token_payload = {
        "sub": str(user.id),
        "is_admin": user.is_admin,
        "exp": exp,
    }
    token = jwt.encode(token_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return TokenResponse(access_token=token, token_type="bearer", expires_in=_TOKEN_LIFETIME_SECONDS)


@router.get("/me", response_model=UserRead)
def get_me(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: Session = Depends(get_session),
) -> UserRead:
    try:
        user = get_user(session, principal.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found") from error

    return UserRead.model_validate(user, from_attributes=True)
