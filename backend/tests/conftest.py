"""Pytest configuration and global fixtures for backend tests."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
import jwt
import pytest
from sqlmodel import Session

from app.cache.store import get_cache
from app.config import settings
from app.database import engine as database_engine
from app.database.engine import create_engine
from app.database.init import init_db
from app.main import app


@pytest.fixture(autouse=True)
def reset_cache():
    """Clear cache before each test to ensure test isolation.
    
    This prevents cached data from one test affecting another test.
    """
    cache = get_cache()
    cache._hday_entries.clear()
    cache._team_entries.clear()
    yield


@pytest.fixture()
def test_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Create a temporary SQLite database and initialize schema."""
    db_path = tmp_path / "worktime-test.db"
    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_path))

    original_engine = database_engine._engine
    database_engine._engine = None

    init_db()
    test_engine = database_engine._engine
    try:
        yield db_path
    finally:
        if test_engine is not None:
            test_engine.dispose()
        database_engine._engine = original_engine
        if db_path.exists():
            db_path.unlink()


@pytest.fixture()
def db_session(test_db: Path) -> Session:
    """Provide direct session access to the temporary test database."""
    with Session(create_engine()) as session:
        yield session


@pytest.fixture()
def db_client(test_db: Path) -> TestClient:
    """Create a TestClient backed by the temporary SQLite database."""
    with TestClient(app) as client:
        yield client


@pytest.fixture()
def auth_headers() -> callable:
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
