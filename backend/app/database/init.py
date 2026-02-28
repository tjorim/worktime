"""Database initialization utilities."""
import os
from pathlib import Path

from alembic import command
from alembic.config import Config


def init_db() -> None:
    """
    Apply all pending Alembic migrations if AUTO_MIGRATE is set to true.
    This is useful for development environments, but not recommended for production.
    """
    if os.getenv("AUTO_MIGRATE", "false").lower() == "true":
        alembic_ini = Path(__file__).resolve().parent.parent.parent / "alembic.ini"
        alembic_cfg = Config(str(alembic_ini))
        command.upgrade(alembic_cfg, "head")
