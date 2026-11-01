"""Database engine and session management for Worktime backend."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import sqlite

logger = logging.getLogger(__name__)

_engine = None
_session_factory = None


def _build_engine():
    global _engine, _session_factory

    if _engine is None:
        db_url = settings.resolved_database_url()
        if db_url.startswith("sqlite"):
            # In-memory databases need a shared connection to retain their data.
            # File databases need separate connections so concurrent sessions do
            # not commit or roll back each other's transactions.
            logger.info("Creating SQLite async engine (local dev)")
            database = make_url(db_url).database
            _engine = create_async_engine(
                db_url,
                echo=settings.DATABASE_ECHO,
                **({"poolclass": StaticPool} if database in (None, "", ":memory:") else {}),
                connect_args={"check_same_thread": False},
            )
            sqlite.configure_engine(_engine)
        else:
            logger.info("Creating PostgreSQL async engine")
            _engine = create_async_engine(
                db_url,
                echo=settings.DATABASE_ECHO,
                # Pool defaults: size=5, max_overflow=10, timeout=30s.
                # Override via DATABASE_POOL_SIZE / DATABASE_POOL_MAX_OVERFLOW env vars if needed.
                pool_size=settings.DATABASE_POOL_SIZE,
                max_overflow=settings.DATABASE_POOL_MAX_OVERFLOW,
                # Test each pooled connection with a lightweight ping before handing
                # it out. Without this, connections dropped by a Postgres restart
                # (or an idle-connection reaper) sit in the pool until first use,
                # so the first requests after such an event fail instead of
                # transparently reconnecting.
                pool_pre_ping=True,
            )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    return _engine, _session_factory


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the shared async session factory singleton."""
    _, factory = _build_engine()
    return factory


async def get_session() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency for injecting a database session."""
    factory = get_session_factory()
    async with factory() as session:
        yield session
