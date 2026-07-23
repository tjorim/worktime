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
    # batch_alter_table: adding a foreign key to an existing table is a plain
    # ALTER TABLE on Postgres, but SQLite has no such operation at all — batch
    # mode recreates the table there instead, transparently, so this works on
    # both dialects (SQLite is local dev only, no Postgres container needed).
    with op.batch_alter_table("time_tracking_tasks") as batch_op:
        batch_op.add_column(sa.Column("gantt_task_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_time_tracking_tasks_gantt_task_id",
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
    with op.batch_alter_table("time_tracking_tasks") as batch_op:
        batch_op.drop_constraint("fk_time_tracking_tasks_gantt_task_id", type_="foreignkey")
        batch_op.drop_column("gantt_task_id")
