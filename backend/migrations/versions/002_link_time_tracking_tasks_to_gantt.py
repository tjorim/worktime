"""Link time tracking tasks to optional Gantt tasks.

Revision ID: 002
Revises: 001
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("time_tracking_tasks", sa.Column("gantt_task_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_time_tracking_tasks_gantt_task_id",
        "time_tracking_tasks",
        "gantt_tasks",
        ["gantt_task_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_time_tracking_tasks_gantt_task_id",
        "time_tracking_tasks",
        ["gantt_task_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_time_tracking_tasks_gantt_task_id", table_name="time_tracking_tasks")
    op.drop_constraint(
        "fk_time_tracking_tasks_gantt_task_id", "time_tracking_tasks", type_="foreignkey"
    )
    op.drop_column("time_tracking_tasks", "gantt_task_id")
