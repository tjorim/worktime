"""Pytest configuration and global fixtures for backend tests."""

from __future__ import annotations

from collections.abc import Callable, Generator

from fastapi.testclient import TestClient
import jwt
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.cache.store import get_cache
from app.config import settings
from app.database.engine import get_session
from app.main import app


@pytest.fixture(autouse=True)
def reset_cache() -> Generator[None, None, None]:
    """Clear cache before each test to ensure test isolation.

    This prevents cached data from one test affecting another test.
    """
    cache = get_cache()
    cache._hday_entries.clear()
    cache._team_entries.clear()
    yield


@pytest.fixture()
def test_db() -> Generator:
    """Create an isolated in-memory SQLite engine with initialized schema."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def db_session(test_db) -> Generator[Session, None, None]:
    """Provide direct session access to the isolated test database."""
    with Session(test_db) as session:
        yield session


@pytest.fixture()
def db_client(test_db) -> Generator[TestClient, None, None]:
    """Create a TestClient that uses a test-specific database session."""

    def override_get_session() -> Generator[Session, None, None]:
        with Session(test_db) as session:
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
