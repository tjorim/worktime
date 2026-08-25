"""Add fcm_device_tokens for Android push-wake notifications.

One row per registered Android device (FCM registration token), mirroring
push_subscriptions' shape. See app.database.models.FcmDeviceToken and
app.services.fcm_service -- FCM here carries no reminder content, only a
silent wake signal.

Revision ID: 002
Revises: 001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fcm_device_tokens",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fcm_device_tokens_token", "fcm_device_tokens", ["token"], unique=True)
    op.create_index("ix_fcm_device_tokens_user_id", "fcm_device_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_fcm_device_tokens_user_id", table_name="fcm_device_tokens")
    op.drop_index("ix_fcm_device_tokens_token", table_name="fcm_device_tokens")
    op.drop_table("fcm_device_tokens")
