"""Add managed, database-backed integration clients.

Replaces the long-lived static-token map parsed from
WORKTIME_MCP_INTEGRATION_KEYS with revocable, rotatable, rate-limited,
per-user credentials. WORKTIME_MCP_INTEGRATION_KEYS keeps working alongside
this table for a documented overlap/migration period — see
docs/integrations/LOCAL_MCP_SERVER.md.

Revision ID: 004
Revises: 003
Create Date: 2026-08-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "integration_clients",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("key_hash", sa.String(length=128), nullable=False),
        sa.Column("key_preview", sa.String(length=8), nullable=False),
        sa.Column(
            "scopes",
            sa.JSON(),
            nullable=False,
            server_default='["worktime:mcp"]',
        ),
        sa.Column(
            "rate_limit_per_minute",
            sa.Integer(),
            nullable=False,
            server_default="120",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_limit_window_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_limit_window_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_integration_clients_user_id", "integration_clients", ["user_id"])
    op.create_index("ix_integration_clients_key_hash", "integration_clients", ["key_hash"], unique=True)
    op.create_index(
        "ix_integration_clients_user_id_created_at",
        "integration_clients",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_integration_clients_user_id_created_at", table_name="integration_clients")
    op.drop_index("ix_integration_clients_key_hash", table_name="integration_clients")
    op.drop_index("ix_integration_clients_user_id", table_name="integration_clients")
    op.drop_table("integration_clients")
