"""Database initialization utilities."""

from sqlmodel import SQLModel

from app.database.engine import create_engine
from app.database import models  # noqa: F401


def init_db() -> None:
    """Initialize database schema (idempotent)."""
    SQLModel.metadata.create_all(create_engine())
