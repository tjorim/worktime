"""Tests for database engine, sessions, and initialization."""

from unittest.mock import Mock

import pytest

from app.database import engine as database_engine
from app.database.engine import create_engine, get_session
from app.database.init import init_db


@pytest.fixture(autouse=True)
def reset_database_engine_singleton() -> None:
    """Reset database engine singleton between tests for isolation."""
    existing_engine = database_engine._engine
    database_engine._engine = None

    if existing_engine is not None:
        existing_engine.dispose()

    yield

    if database_engine._engine is not None:
        database_engine._engine.dispose()
    database_engine._engine = None


class TestDatabaseEngine:
    """Database engine creation tests."""

    def test_create_engine_singleton(self):
        """Engine factory should return the same instance repeatedly."""
        engine_one = create_engine()
        engine_two = create_engine()

        assert engine_one is engine_two

    def test_engine_uses_sqlite(self):
        """Engine should be configured for SQLite."""
        engine = create_engine()

        assert engine.url.drivername == "sqlite"


class TestDatabaseSession:
    """Database session dependency tests."""

    def test_get_session_yields_open_session(self):
        """Session dependency should yield an active session object."""
        dependency = get_session()
        session = next(dependency)

        assert session.is_active

        dependency.close()


class TestDatabaseInit:
    """Database initialization tests."""

    def test_init_db_runs_alembic_upgrade(self, monkeypatch):
        """init_db should run alembic upgrade to head."""
        upgrade_mock = Mock()
        monkeypatch.setattr("app.database.init.command.upgrade", upgrade_mock)

        init_db()

        upgrade_mock.assert_called_once()
        args = upgrade_mock.call_args
        assert args[0][1] == "head"


class TestLifespanInitialization:
    """Startup initialization behavior tests."""

    def test_lifespan_initializes_db_when_enabled(self, monkeypatch):
        """Startup should initialize DB when DATABASE_ENABLED=true."""
        from app import main

        fake_settings = Mock()
        fake_settings.log_configuration = Mock()
        fake_settings.get_share_dir_path.return_value.exists.return_value = True
        fake_settings.get_share_dir_path.return_value.is_dir.return_value = True
        fake_settings.CACHE_ENABLED = False
        fake_settings.DATABASE_ENABLED = True

        init_db_mock = Mock()

        monkeypatch.setattr(main, "settings", fake_settings)
        monkeypatch.setattr(main, "init_db", init_db_mock)
        monkeypatch.setattr(main.os, "access", lambda *_: True)

        async def run_lifespan():
            async with main.lifespan(main.app):
                return None

        import asyncio

        asyncio.run(run_lifespan())

        init_db_mock.assert_called_once()

    def test_lifespan_skips_db_when_disabled(self, monkeypatch):
        """Startup should skip DB initialization when DATABASE_ENABLED=false."""
        from app import main

        fake_settings = Mock()
        fake_settings.log_configuration = Mock()
        fake_settings.get_share_dir_path.return_value.exists.return_value = True
        fake_settings.get_share_dir_path.return_value.is_dir.return_value = True
        fake_settings.CACHE_ENABLED = False
        fake_settings.DATABASE_ENABLED = False

        init_db_mock = Mock()

        monkeypatch.setattr(main, "settings", fake_settings)
        monkeypatch.setattr(main, "init_db", init_db_mock)
        monkeypatch.setattr(main.os, "access", lambda *_: True)

        async def run_lifespan():
            async with main.lifespan(main.app):
                return None

        import asyncio

        asyncio.run(run_lifespan())

        init_db_mock.assert_not_called()
