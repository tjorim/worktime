"""add cascade delete to gantt task user fk

Revision ID: 2d3c9f8b1e44
Revises: 5f3d7c1a2b6e
Create Date: 2026-02-28 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2d3c9f8b1e44'
down_revision: Union[str, Sequence[str], None] = '5f3d7c1a2b6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _recreate_gantt_tasks_table(*, ondelete_cascade: bool) -> None:
    fk_suffix = ' ON DELETE CASCADE' if ondelete_cascade else ''

    op.execute(
        f"""
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
            FOREIGN KEY(user_id) REFERENCES users (id){fk_suffix}
        )
        """
    )
    op.execute(
        """
        INSERT INTO gantt_tasks__new (
            id, user_id, name, start_date, end_date, progress,
            dependencies, notes, created_at, updated_at, deleted_at
        )
        SELECT
            id, user_id, name, start_date, end_date, progress,
            dependencies, notes, created_at, updated_at, deleted_at
        FROM gantt_tasks
        """
    )
    op.drop_table('gantt_tasks')
    op.rename_table('gantt_tasks__new', 'gantt_tasks')
    op.create_index('ix_gantt_tasks_deleted_at', 'gantt_tasks', ['deleted_at'], unique=False)
    op.create_index('ix_gantt_tasks_updated_at', 'gantt_tasks', ['updated_at'], unique=False)
    op.create_index('ix_gantt_tasks_user_id', 'gantt_tasks', ['user_id'], unique=False)


def upgrade() -> None:
    """Upgrade schema."""
    _recreate_gantt_tasks_table(ondelete_cascade=True)


def downgrade() -> None:
    """Downgrade schema."""
    _recreate_gantt_tasks_table(ondelete_cascade=False)
