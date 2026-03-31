"""Pytest configuration and global fixtures for backend tests."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Callable, Generator

import jwt
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.cache.store import get_cache
from app.config import settings
from app.database.engine import get_session
from app.database.models import Base
from app.main import app

_TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    # Default targets a *separate* test database (worktime_test) so the dev
    # database (worktime, provisioned by docker-compose) is never touched.
    # Create it once with: psql -U worktime -c "CREATE DATABASE worktime_test;"
    # Override via TEST_DATABASE_URL env var in CI or custom environments.
    "postgresql+asyncpg://worktime:worktime@localhost/worktime_test",
)


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
def reset_cache() -> Generator[None, None, None]:
    """Clear cache before each test to ensure test isolation."""
    cache = get_cache()
    cache._hday_entries.clear()
    cache._team_entries.clear()
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


@pytest.fixture()
def db_client(test_db: AsyncEngine) -> Generator[TestClient, None, None]:
    """Create a TestClient that uses a test-specific async database session."""
    factory = async_sessionmaker(test_db, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.fixture()
def auth_headers() -> Callable[..., dict[str, str]]:
    """Build bearer auth headers for a user token."""

    def _headers(user_id: int, *, is_admin: bool = False) -> dict[str, str]:
        token_payload: dict[str, str | bool] = {"sub": str(user_id)}
        if is_admin:
            token_payload["is_admin"] = True

        token = jwt.encode(
            token_payload,
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )
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
            "/v1/db/users/",
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
