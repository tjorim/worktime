"""The migration chain must run on SQLite, which the local-dev shortcut in AGENTS.md relies on.

SQLite has no ALTER TABLE ADD CONSTRAINT, so a revision that adds a constraint to an
existing table has to use batch mode. This runs the real chain, not a mock.
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _alembic(database_url: str, *args: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"alembic {' '.join(args)} failed:\n{result.stderr[-2000:]}"


def test_migrations_upgrade_and_downgrade_on_sqlite(tmp_path):
    database = tmp_path / "migrations.db"
    url = f"sqlite+aiosqlite:///{database}"

    _alembic(url, "upgrade", "head")
    with sqlite3.connect(database) as connection:
        gantt_tasks = connection.execute("SELECT sql FROM sqlite_master WHERE name = 'gantt_tasks'").fetchone()[0]
    assert "ck_gantt_tasks_date_range" in gantt_tasks

    _alembic(url, "downgrade", "base")
    _alembic(url, "upgrade", "head")
