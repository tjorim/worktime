"""Add TimeTrackingTask.reminder_completed_at.

Distinguishes a claimed-and-finished reminder from one whose claim was
orphaned by a process crash between the atomic claim and send completion --
see app.services.planned_task_reminder_scheduler._release_stale_claims. A
threshold-only staleness check without this column would be unable to tell
an abandoned claim apart from an ordinary already-sent one, and would
re-release (and duplicate-send) every normal reminder once it aged past the
threshold.

Backfills reminder_completed_at = reminder_sent_at for existing rows: without
this, every reminder already sent under the previous version would look
identical to an abandoned claim (reminder_completed_at NULL) and get
immediately released -- and duplicate-sent -- by the very first sweep that
runs after this deploys, for any task still upcoming at deploy time.

Revision ID: 003
Revises: 002
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "time_tracking_tasks", sa.Column("reminder_completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        sa.text(
            "UPDATE time_tracking_tasks "
            "SET reminder_completed_at = reminder_sent_at "
            "WHERE reminder_sent_at IS NOT NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("time_tracking_tasks", "reminder_completed_at")
