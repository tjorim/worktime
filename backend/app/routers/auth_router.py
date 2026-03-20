"""Authentication endpoints: login and current-user."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

from app.routers.auth import AuthenticatedPrincipal, get_authenticated_principal
from app.config import settings
from app.database.engine import get_session
from app.schemas import LoginRequest, TokenResponse, UserRead
from app.services.db_service import NotFoundError, ValidationError, authenticate_user, get_user

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])


class LoginRateLimiter:
    """In-memory login throttling keyed by username and client IP."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 300) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, tuple[int, float]] = {}
        self._lock = Lock()

    def _prune_if_expired(self, key: str, *, now: float) -> None:
        entry = self._attempts.get(key)
        if entry is None:
            return
        _, reset_at = entry
        if now >= reset_at:
            self._attempts.pop(key, None)

    def is_limited(self, key: str) -> int | None:
        now = monotonic()
        with self._lock:
            self._prune_if_expired(key, now=now)
            entry = self._attempts.get(key)
            if entry is None:
                return None
            count, reset_at = entry
            if count < self.max_attempts:
                return None
            return max(1, int(reset_at - now))

    def register_failure(self, key: str) -> int:
        now = monotonic()
        with self._lock:
            self._prune_if_expired(key, now=now)
            count, reset_at = self._attempts.get(key, (0, now + self.window_seconds))
            count += 1
            self._attempts[key] = (count, reset_at)
            return max(1, int(reset_at - now))

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


@lru_cache(maxsize=1)
def get_login_rate_limiter() -> LoginRateLimiter:
    """Provide a process-wide login rate limiter instance."""
    return LoginRateLimiter()


@router.post("/token", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    rate_limiter: LoginRateLimiter = Depends(get_login_rate_limiter),
) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    throttle_key = f"{payload.username.lower()}:{client_ip}"

    retry_after = rate_limiter.is_limited(throttle_key)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        user = await authenticate_user(session, payload.username, payload.password)
    except ValidationError as error:
        rate_limiter.register_failure(throttle_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    rate_limiter.reset(throttle_key)

    token_lifetime_seconds = settings.JWT_ACCESS_TOKEN_EXPIRE_SECONDS
    exp = datetime.now(timezone.utc) + timedelta(seconds=token_lifetime_seconds)
    token_payload = {
        "sub": str(user.id),
        "is_admin": user.is_admin,
        "exp": exp,
    }
    token = jwt.encode(token_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return TokenResponse(access_token=token, token_type="bearer", expires_in=token_lifetime_seconds)


@router.get("/me", response_model=UserRead)
async def get_me(
    principal: AuthenticatedPrincipal = Depends(get_authenticated_principal),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    try:
        user = await get_user(session, principal.user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found") from error

    return UserRead.model_validate(user, from_attributes=True)
