"""Enforce start_date <= end_date on gantt_tasks.

The sync push path (``_push_gantt_task``) didn't previously re-validate this
invariant, unlike the REST create/update schemas, so an offline client could
push an inverted task (``end_date`` before ``start_date``) that the REST API
would have rejected with a 422. The repair step below runs before the
constraint is added so it's safe even on a table that currently violates it:
for each inverted row, ``start_date`` and ``end_date`` are swapped (there's no
way to know which value the user actually intended, but swapping preserves
the task's duration and un-inverts the bar) and ``updated_at``/
``client_updated_at`` are bumped to the migration time so the repair is
visible to an incremental pull and outranks a still-queued stale client push.

Revision ID: 007
Revises: 006
Create Date: 2026-08-19
"""

from collections.abc import Sequence

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE gantt_tasks
        SET start_date = end_date,
            end_date = start_date,
            updated_at = CURRENT_TIMESTAMP,
            client_updated_at = CURRENT_TIMESTAMP
        WHERE end_date < start_date
        """
    )
    op.create_check_constraint("ck_gantt_tasks_date_range", "gantt_tasks", "start_date <= end_date")


def downgrade() -> None:
    op.drop_constraint("ck_gantt_tasks_date_range", "gantt_tasks", type_="check")
