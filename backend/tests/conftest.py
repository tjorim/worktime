"""Pytest configuration and global fixtures for backend tests."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Callable, Generator
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.testclient import TestClient
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.cache.store import get_cache
from app.database.engine import get_session
from app.database.models import Base
from app.main import app
from app.routers.auth import AuthenticatedPrincipal, get_authenticated_principal

_TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    # Default targets a *separate* test database (worktime_test) so the dev
    # database (worktime, provisioned by docker-compose) is never touched.
    # Create it once with: psql -U worktime -c "CREATE DATABASE worktime_test;"
    # Override via TEST_DATABASE_URL env var in CI or custom environments.
    "postgresql+asyncpg://worktime:worktime@localhost/worktime_test",
)


def utc_timestamp_offset(offset_seconds: float = 0.0) -> str:
    """Return an ISO-8601 UTC timestamp offset from now by *offset_seconds*."""
    return (datetime.now(UTC) + timedelta(seconds=offset_seconds)).isoformat()


def _assert_test_database_url(url: str) -> None:
    """Raise RuntimeError if *url* does not look like a safe test database.

    We require the database name to contain the word "test" OR the host to be
    localhost/127.0.0.1 — as a last-resort guard against accidentally running
    drop_all() against a production database.
    """
    from sqlalchemy.engine.url import make_url

    parsed = make_url(url)
    host = (parsed.host or "").lower()
    dbname = (parsed.database or "").lower()

    is_local = host in ("localhost", "127.0.0.1", "::1")
    is_test_db = "test" in dbname
    if not (is_local or is_test_db):
        raise RuntimeError(
            f"TEST_DATABASE_URL ({url!r}) does not appear to be a safe test database. "
            "The host must be localhost or the database name must contain 'test'. "
            "Refusing to run drop_all() to protect production data."
        )


@pytest.fixture(autouse=True)
def mock_supertokens_signup() -> Generator[None, None, None]:
    """Mock SuperTokens sign_up so tests don't require a live core.

    Returns a fresh UUID as the SuperTokens user ID for each call, matching
    the unique constraint on supertokens_user_id in the users table.
    """
    from supertokens_python.recipe.emailpassword.interfaces import SignUpOkResult as STSignUpOkResult

    async def _fake_sign_up(*args: object, **kwargs: object) -> MagicMock:
        result = MagicMock()
        result.__class__ = STSignUpOkResult  # makes isinstance(result, STSignUpOkResult) → True
        result.user.id = str(uuid4())
        return result

    with (
        patch("app.routers.db_users.st_sign_up", side_effect=_fake_sign_up),
        patch("app.routers.registration.st_sign_up", side_effect=_fake_sign_up),
        patch("app.routers.registration.st_delete_user", return_value=True),
    ):
        yield


@pytest.fixture()
def supertokens_update_email_calls() -> Generator[list[dict[str, str | None]], None, None]:
    """Capture SuperTokens email update calls without requiring a live core."""
    from supertokens_python.recipe.emailpassword.interfaces import (
        UpdateEmailOrPasswordOkResult as STUpdateEmailOrPasswordOkResult,
    )

    calls: list[dict[str, str | None]] = []

    async def _fake_update_email_or_password(
        recipe_user_id: object,
        email: str | None = None,
        password: str | None = None,
        *args: object,
        **kwargs: object,
    ) -> MagicMock:
        calls.append(
            {
                "recipe_user_id": str(recipe_user_id),
                "email": email,
                "password": password,
            }
        )
        result = MagicMock()
        result.__class__ = STUpdateEmailOrPasswordOkResult
        return result

    with patch(
        "app.routers.db_users.st_update_email_or_password",
        side_effect=_fake_update_email_or_password,
    ):
        yield calls


@pytest.fixture()
def supertokens_delete_calls() -> Generator[list[str], None, None]:
    """Capture SuperTokens delete calls without requiring a live core."""
    calls: list[str] = []

    async def _fake_delete_user(user_id: str, *args: object, **kwargs: object) -> bool:
        calls.append(user_id)
        return True

    with patch("app.routers.db_users.st_delete_user", side_effect=_fake_delete_user):
        yield calls


@pytest.fixture(autouse=True)
def reset_cache() -> Generator[None, None, None]:
    """Clear cache before each test to ensure test isolation."""
    cache = get_cache()
    cache._hday_entries.clear()
    cache._team_entries.clear()
    cache._holiday_entries.clear()
    yield


@pytest_asyncio.fixture(scope="session")
async def _schema_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Session-scoped engine: create schema once, drop it after all tests."""
    _assert_test_database_url(_TEST_DATABASE_URL)
    engine = create_async_engine(_TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture()
async def test_db(_schema_engine: AsyncEngine) -> AsyncGenerator[AsyncEngine, None]:
    """Per-test fixture: yields the shared engine and truncates all tables after each test."""
    yield _schema_engine
    async with _schema_engine.begin() as conn:
        table_names = ", ".join(
            f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
        )
        await conn.execute(
            sql_text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE")
        )


@pytest_asyncio.fixture()
async def db_session(test_db: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Provide direct async session access to the isolated test database."""
    factory = async_sessionmaker(test_db, expire_on_commit=False)
    async with factory() as session:
        yield session


_bearer_scheme = HTTPBearer(auto_error=False)


def _test_auth_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedPrincipal:
    """Test-only override for ``get_authenticated_principal``.

    Expects a test token in the format ``test.<user_id>.admin`` or
    ``test.<user_id>.user`` (produced by the ``auth_headers`` fixture).
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    parts = credentials.credentials.split(".")
    if len(parts) != 3 or parts[0] != "test":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid test token format",
        )
    try:
        user_id = int(parts[1])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid test token: user_id is not an integer",
        ) from None
    if parts[2] not in ("admin", "user"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid test token: role must be 'admin' or 'user'",
        )
    return AuthenticatedPrincipal(
        user_id=user_id,
        is_admin=parts[2] == "admin",
    )


@pytest.fixture()
def db_client(test_db: AsyncEngine) -> Generator[TestClient, None, None]:
    """Create a TestClient that uses a test-specific async database session."""
    factory = async_sessionmaker(test_db, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_authenticated_principal] = _test_auth_principal
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_authenticated_principal, None)


@pytest.fixture()
def auth_headers() -> Callable[..., dict[str, str]]:
    """Build bearer auth headers using a simple test token format.

    Tokens are ``test.<user_id>.admin`` or ``test.<user_id>.user`` and are
    parsed by the ``_test_auth_principal`` dependency override in
    ``db_client``.
    """

    def _headers(user_id: int, *, is_admin: bool = False) -> dict[str, str]:
        role = "admin" if is_admin else "user"
        token = f"test.{user_id}.{role}"
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture()
def create_user_factory() -> Callable[..., int]:
    """Create users through the DB user endpoint for integration tests."""

    def _create_user(
        db_client: TestClient,
        headers: dict[str, str],
        username: str,
        *,
        display_name: str | None = None,
        settings_payload: dict | None = None,
    ) -> int:
        response = db_client.post(
            "/api/users/",
            json={
                "username": username,
                "display_name": display_name or username.title(),
                "settings": settings_payload or {},
                "password": "test-password-1",
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    return _create_user
