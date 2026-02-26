"""Database engine and session management for Worktime backend."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine as sqlmodel_create_engine

from app.config import settings

_engine: Engine | None = None


def create_engine() -> Engine:
    """Create and return a singleton SQLModel engine instance."""
    global _engine

    if _engine is None:
        db_path = Path(settings.DATABASE_PATH).expanduser().resolve()
        database_url = f"sqlite:///{db_path}"
        _engine = sqlmodel_create_engine(
            database_url,
            echo=settings.DATABASE_ECHO,
            connect_args={"check_same_thread": False},
        )

    return _engine


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency for injecting a database session."""
    engine = create_engine()
    with Session(engine) as session:
        yield session
