"""Link Gantt tasks to optional time tracking labels.

Revision ID: 002
Revises: 001
Create Date: 2026-07-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("gantt_tasks") as batch_op:
        batch_op.add_column(sa.Column("label_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_gantt_tasks_label_id",
            "time_tracking_labels",
            ["label_id"],
            ["id"],
        )
    op.create_index("ix_gantt_tasks_label_id", "gantt_tasks", ["label_id"])


def downgrade() -> None:
    op.drop_index("ix_gantt_tasks_label_id", table_name="gantt_tasks")
    with op.batch_alter_table("gantt_tasks") as batch_op:
        batch_op.drop_constraint("fk_gantt_tasks_label_id", type_="foreignkey")
        batch_op.drop_column("label_id")
