"""Add composite indexes for the hot sync-pull and task-listing queries.

pull_changes filters every synced table on (user_id, updated_at > since);
list_tasks additionally sorts by start_time within a user_id filter. Only
single-column indexes existed on user_id and updated_at separately, so
Postgres had to intersect two index scans (or fall back to a user_id scan
plus filter) instead of satisfying each query with a single composite index
scan.

Revision ID: 003
Revises: 002
Create Date: 2026-07-21
"""

from collections.abc import Sequence

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SYNCED_TABLES = (
    "time_tracking_labels",
    "time_tracking_tasks",
    "time_tracking_templates",
    "work_locations",
    "gantt_tasks",
    "time_off_entries",
)


def upgrade() -> None:
    for table in _SYNCED_TABLES:
        op.create_index(
            f"ix_{table}_user_id_updated_at",
            table,
            ["user_id", "updated_at"],
        )
    op.create_index(
        "ix_time_tracking_tasks_user_id_start_time",
        "time_tracking_tasks",
        ["user_id", "start_time"],
    )


def downgrade() -> None:
    op.drop_index("ix_time_tracking_tasks_user_id_start_time", table_name="time_tracking_tasks")
    for table in reversed(_SYNCED_TABLES):
        op.drop_index(f"ix_{table}_user_id_updated_at", table_name=table)
