"""Database engine and session management for Worktime backend."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logger = logging.getLogger(__name__)

_engine = None
_session_factory = None


def _build_engine():
    global _engine, _session_factory

    if _engine is None:
        db_path = Path(settings.DATABASE_PATH).expanduser().resolve()
        database_url = f"sqlite+aiosqlite:///{db_path}"
        resolved_db_path = make_url(database_url).database or ""
        if resolved_db_path and resolved_db_path != ":memory:":
            parent = Path(resolved_db_path).parent
            parent.mkdir(parents=True, exist_ok=True)
            logger.info("SQLite data directory ready: %s", parent)

        _engine = create_async_engine(
            database_url,
            echo=settings.DATABASE_ECHO,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(_engine.sync_engine, "connect")
        def set_sqlite_pragmas(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    return _engine, _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for injecting a database session."""
    _, factory = _build_engine()
    async with factory() as session:
        yield session
