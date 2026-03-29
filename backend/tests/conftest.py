"""Pytest configuration and global fixtures for backend tests."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Callable, Generator

import jwt
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.cache.store import get_cache
from app.config import settings
from app.database.engine import get_session
from app.database.models import Base
from app.main import app

_TEST_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://worktime:worktime@localhost/worktime_test",
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
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


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
