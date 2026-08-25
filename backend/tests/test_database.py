"""Tests for database engine, sessions, and initialization."""

import asyncio
from collections.abc import Generator
from unittest.mock import AsyncMock, Mock

import pytest

from app.database import engine as database_engine
from app.database.init import init_db


@pytest.fixture(autouse=True)
def reset_database_engine_singleton() -> Generator[None]:
    """Reset database engine singleton between tests for isolation."""
    existing_engine = database_engine._engine
    database_engine._engine = None
    database_engine._session_factory = None

    yield

    if existing_engine is not None:
        existing_engine.sync_engine.dispose()
    database_engine._engine = None
    database_engine._session_factory = None


class TestDatabaseEngine:
    """Database engine creation tests."""

    def test_build_engine_singleton(self):
        """Engine factory should return the same instance repeatedly."""
        engine_one, _ = database_engine._build_engine()
        engine_two, _ = database_engine._build_engine()

        assert engine_one is engine_two

    def test_engine_uses_postgresql_asyncpg(self):
        """Engine should be configured for async PostgreSQL."""
        engine, _ = database_engine._build_engine()

        assert "postgresql" in engine.url.drivername
        assert "asyncpg" in engine.url.drivername


class TestDatabaseInit:
    """Database initialization tests."""

    def test_init_db_runs_alembic_upgrade(self, monkeypatch):
        """init_db should run alembic upgrade to head."""
        monkeypatch.setenv("AUTO_MIGRATE", "true")
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

        asyncio.run(run_lifespan())

        init_db_mock.assert_not_called()

    def test_lifespan_awaits_background_task_cancellation(self, monkeypatch):
        """Shutdown lets each cancelled background task finish its cleanup."""
        from app import main
        from app.config import oidc_config
        from app.services import planned_task_reminder_scheduler

        fake_settings = Mock()
        fake_settings.log_configuration = Mock()
        fake_settings.get_share_dir_path.return_value.exists.return_value = True
        fake_settings.get_share_dir_path.return_value.is_dir.return_value = True
        fake_settings.CACHE_ENABLED = False
        fake_settings.DATABASE_ENABLED = True
        fake_settings.OIDC_ISSUER_URL = "https://issuer.test"
        fake_settings.push_notifications_enabled = True

        completed = []

        async def background(name):
            try:
                await asyncio.Event().wait()
            finally:
                completed.append(name)

        monkeypatch.setattr(main, "settings", fake_settings)
        monkeypatch.setattr(main, "init_db", Mock())
        monkeypatch.setattr(main.os, "access", lambda *_: True)
        monkeypatch.setattr(main.sync_event_manager, "start_pg_listener", AsyncMock())
        monkeypatch.setattr(main.sync_event_manager, "stop_pg_listener", AsyncMock())
        monkeypatch.setattr(oidc_config, "start_periodic_jwks_refresh", lambda: asyncio.create_task(background("jwks")))
        monkeypatch.setattr(
            planned_task_reminder_scheduler,
            "start_periodic_planned_task_reminders",
            lambda: asyncio.create_task(background("reminders")),
        )

        async def run_lifespan():
            async with main.lifespan(main.app):
                await asyncio.sleep(0)

        import asyncio

        asyncio.run(run_lifespan())

        assert completed == ["jwks", "reminders"]
