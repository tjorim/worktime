"""Replace the shift-start reminder with a planned-task-starting-soon reminder.

Adds TimeTrackingTask.reminder_sent_at (dedup marker for the new reminder) and
drops the shift-reminder-only columns from push_subscriptions (lead time,
quiet hours, and the old per-shift dedup key), now that reminders are keyed
off the task itself instead of a per-subscription "next shift" computation.

Revision ID: 001
Revises: 000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: str | None = "000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("time_tracking_tasks", sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_time_tracking_tasks_pending_reminder",
        "time_tracking_tasks",
        ["start_time"],
        postgresql_where=sa.text("reminder_sent_at IS NULL AND stop_time IS NOT NULL AND deleted_at IS NULL"),
    )

    op.drop_column("push_subscriptions", "last_reminder_claimed_at")
    op.drop_column("push_subscriptions", "last_reminder_key")
    op.drop_column("push_subscriptions", "quiet_hours_end")
    op.drop_column("push_subscriptions", "quiet_hours_start")
    op.drop_column("push_subscriptions", "lead_time_minutes")


def downgrade() -> None:
    op.add_column(
        "push_subscriptions", sa.Column("lead_time_minutes", sa.Integer(), nullable=False, server_default="15")
    )
    op.add_column("push_subscriptions", sa.Column("quiet_hours_start", sa.Integer(), nullable=True))
    op.add_column("push_subscriptions", sa.Column("quiet_hours_end", sa.Integer(), nullable=True))
    op.add_column("push_subscriptions", sa.Column("last_reminder_key", sa.String(), nullable=True))
    op.add_column(
        "push_subscriptions", sa.Column("last_reminder_claimed_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.drop_index("ix_time_tracking_tasks_pending_reminder", table_name="time_tracking_tasks")
    op.drop_column("time_tracking_tasks", "reminder_sent_at")
