"""Database engine and session management for Worktime backend."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

_engine = None
_session_factory = None


def _build_engine():
    global _engine, _session_factory

    if _engine is None:
        db_path = Path(settings.DATABASE_PATH).expanduser().resolve()
        database_url = f"sqlite+aiosqlite:///{db_path}"
        _engine = create_async_engine(
            database_url,
            echo=settings.DATABASE_ECHO,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(_engine.sync_engine, "connect")
        def set_sqlite_pragmas(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
            dbapi_conn.execute("PRAGMA journal_mode=WAL")
            dbapi_conn.execute("PRAGMA synchronous=NORMAL")

        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    return _engine, _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for injecting a database session."""
    _, factory = _build_engine()
    async with factory() as session:
        yield session
