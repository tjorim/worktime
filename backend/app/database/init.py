"""Database initialization utilities."""

from pathlib import Path

from alembic import command
from alembic.config import Config


def init_db() -> None:
    """Apply all pending Alembic migrations (idempotent)."""
    alembic_ini = Path(__file__).resolve().parent.parent.parent / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini))
    command.upgrade(alembic_cfg, "head")
