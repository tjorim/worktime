"""Database engine and session management for Worktime backend."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logger = logging.getLogger(__name__)

_engine = None
_session_factory = None


def _build_engine():
    global _engine, _session_factory

    if _engine is None:
        logger.info("Creating PostgreSQL async engine")
        _engine = create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DATABASE_ECHO,
        )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    return _engine, _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for injecting a database session."""
    _, factory = _build_engine()
    async with factory() as session:
        yield session
