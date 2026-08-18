"""Enforce at most one running task per user.

Adds a partial unique index on ``time_tracking_tasks(user_id) WHERE
stop_time IS NULL AND deleted_at IS NULL``. The sync push path didn't
previously enforce the "one running task per user" rule that
``create_task``/``update_task`` already applied, so some accounts may have
accumulated more than one running task (e.g. two offline devices each
starting a task, both pushed later). The repair step below runs before the
index is created so it's safe even on a table that currently violates the
constraint: for each user with more than one running task, all but the
most-recently-started one are closed by setting ``stop_time = start_time``
(a zero-duration close, since we have no way to know when the user actually
intended to stop it). ``updated_at``/``client_updated_at`` are bumped to the
migration time too, so the close is visible to an incremental pull (which
filters on ``updated_at``) and outranks a still-queued stale client push
that might otherwise try to reopen the task via LWW (which compares
``client_updated_at``).

Revision ID: 006
Revises: 005
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Data repair: close every running task except the most recently started
    # one per user, so the unique index below can be created safely.
    op.execute(
        """
        UPDATE time_tracking_tasks
        SET stop_time = start_time,
            updated_at = CURRENT_TIMESTAMP,
            client_updated_at = CURRENT_TIMESTAMP
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       row_number() OVER (
                           PARTITION BY user_id ORDER BY start_time DESC, id DESC
                       ) AS rn
                FROM time_tracking_tasks
                WHERE stop_time IS NULL AND deleted_at IS NULL
            ) ranked
            WHERE rn > 1
        )
        """
    )
    op.create_index(
        "uq_active_running_task_user",
        "time_tracking_tasks",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("stop_time IS NULL AND deleted_at IS NULL"),
        sqlite_where=sa.text("stop_time IS NULL AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_active_running_task_user", table_name="time_tracking_tasks")
