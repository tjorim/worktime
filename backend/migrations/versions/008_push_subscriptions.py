"""Add push_subscriptions table for Web Push shift reminders.

Revision ID: 008
Revises: 007
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("p256dh_key", sa.String(), nullable=False),
        sa.Column("auth_key", sa.String(), nullable=False),
        sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"),
        sa.Column("lead_time_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("quiet_hours_start", sa.Integer(), nullable=True),
        sa.Column("quiet_hours_end", sa.Integer(), nullable=True),
        sa.Column("last_reminder_key", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_push_subscriptions_endpoint", "push_subscriptions", ["endpoint"], unique=True)
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_index("ix_push_subscriptions_endpoint", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
