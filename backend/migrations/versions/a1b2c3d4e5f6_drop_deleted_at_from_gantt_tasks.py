"""drop deleted_at from gantt_tasks

Revision ID: a1b2c3d4e5f6
Revises: 2d3c9f8b1e44
Create Date: 2026-02-28 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '2d3c9f8b1e44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop deleted_at column from gantt_tasks using table recreation (SQLite)."""
    op.execute(
        """
        CREATE TABLE gantt_tasks__new (
            id VARCHAR NOT NULL,
            user_id INTEGER NOT NULL,
            name VARCHAR NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            progress INTEGER NOT NULL,
            dependencies VARCHAR,
            notes VARCHAR,
            created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
            updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        INSERT INTO gantt_tasks__new (
            id, user_id, name, start_date, end_date, progress,
            dependencies, notes, created_at, updated_at
        )
        SELECT
            id, user_id, name, start_date, end_date, progress,
            dependencies, notes, created_at, updated_at
        FROM gantt_tasks
        """
    )
    op.drop_table('gantt_tasks')
    op.rename_table('gantt_tasks__new', 'gantt_tasks')
    op.create_index('ix_gantt_tasks_updated_at', 'gantt_tasks', ['updated_at'], unique=False)
    op.create_index('ix_gantt_tasks_user_id', 'gantt_tasks', ['user_id'], unique=False)


def downgrade() -> None:
    """Re-add deleted_at column to gantt_tasks."""
    op.execute(
        """
        CREATE TABLE gantt_tasks__new (
            id VARCHAR NOT NULL,
            user_id INTEGER NOT NULL,
            name VARCHAR NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            progress INTEGER NOT NULL,
            dependencies VARCHAR,
            notes VARCHAR,
            created_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
            updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
            deleted_at DATETIME,
            PRIMARY KEY (id),
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        INSERT INTO gantt_tasks__new (
            id, user_id, name, start_date, end_date, progress,
            dependencies, notes, created_at, updated_at
        )
        SELECT
            id, user_id, name, start_date, end_date, progress,
            dependencies, notes, created_at, updated_at
        FROM gantt_tasks
        """
    )
    op.drop_table('gantt_tasks')
    op.rename_table('gantt_tasks__new', 'gantt_tasks')
    op.create_index('ix_gantt_tasks_deleted_at', 'gantt_tasks', ['deleted_at'], unique=False)
    op.create_index('ix_gantt_tasks_updated_at', 'gantt_tasks', ['updated_at'], unique=False)
    op.create_index('ix_gantt_tasks_user_id', 'gantt_tasks', ['user_id'], unique=False)
