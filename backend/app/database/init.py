"""Database initialization utilities."""
import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config


logger = logging.getLogger(__name__)


def init_db() -> None:
    """
    Apply all pending Alembic migrations if AUTO_MIGRATE is set to true.
    This is useful for development environments, but not recommended for production.
    """
    auto_migrate_value = os.getenv("AUTO_MIGRATE", "false")
    if auto_migrate_value.lower() == "true":
        alembic_ini = Path(__file__).resolve().parent.parent.parent / "alembic.ini"
        alembic_cfg = Config(str(alembic_ini))
        command.upgrade(alembic_cfg, "head")
        return

    logger.info(
        "Skipping automatic migrations because AUTO_MIGRATE=%r. Run `PYTHONPATH=. alembic -c %s upgrade head` manually to apply pending migrations.",
        auto_migrate_value,
        Path(__file__).resolve().parent.parent.parent / "alembic.ini",
    )
