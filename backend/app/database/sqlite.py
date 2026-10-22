"""SQLite support for local development and the test suite.

Production runs on PostgreSQL; SQLite exists so a dev instance and the tests need no
container. The two differences that matter to this application:

* SQLite stores no timezone, so ``DateTime(timezone=True)`` columns come back naive and
  comparing them with aware values raises ``TypeError``. :class:`UTCDateTime` writes aware
  values as UTC and reads every value back as UTC.
* SQLite ignores foreign keys unless ``PRAGMA foreign_keys=ON`` runs on each connection.

Call :func:`configure_engine` on every SQLite engine, before its first connection.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import event, types
from sqlalchemy.dialects.sqlite import DATETIME
from sqlalchemy.dialects.sqlite.base import SQLiteDialect
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite
from sqlalchemy.ext.asyncio import AsyncEngine

_installed = False


class UTCDateTime(DATETIME):
    """SQLite ``DATETIME`` that round-trips timezone-aware values as UTC."""

    def bind_processor(self, dialect: Any) -> Any:
        inner = super().bind_processor(dialect)

        def process(value: Any) -> Any:
            if self.timezone and isinstance(value, datetime) and value.tzinfo is not None:
                value = value.astimezone(UTC)
            return inner(value) if inner else value

        return process

    def result_processor(self, dialect: Any, coltype: Any) -> Any:
        inner = super().result_processor(dialect, coltype)

        def process(value: Any) -> Any:
            result = inner(value) if inner else value
            if self.timezone and isinstance(result, datetime) and result.tzinfo is None:
                return result.replace(tzinfo=UTC)
            return result

        return process


def _enable_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def install() -> None:
    """Make SQLite read timezone-aware datetimes back as UTC. Idempotent; process-wide."""
    global _installed
    if not _installed:
        # pysqlite defines its own colspecs, and aiosqlite inherits from pysqlite.
        for dialect in (SQLiteDialect, SQLiteDialect_pysqlite):
            dialect.colspecs = {**dialect.colspecs, types.DateTime: UTCDateTime}
        _installed = True


def configure_engine(engine: AsyncEngine) -> None:
    """Install the datetime handling and switch foreign keys on for every connection of *engine*."""
    install()
    event.listen(engine.sync_engine, "connect", _enable_foreign_keys)
