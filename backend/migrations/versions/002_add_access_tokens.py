"""Add access_tokens table for personal access tokens (e.g. Pebble companion app).

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
    op.create_table(
        "access_tokens",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("token_preview", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_access_tokens_token_hash", "access_tokens", ["token_hash"], unique=True)
    op.create_index("ix_access_tokens_user_id", "access_tokens", ["user_id"])
    op.create_index(
        "ix_access_tokens_user_id_created_at", "access_tokens", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_access_tokens_user_id_created_at", table_name="access_tokens")
    op.drop_index("ix_access_tokens_user_id", table_name="access_tokens")
    op.drop_index("ix_access_tokens_token_hash", table_name="access_tokens")
    op.drop_table("access_tokens")
