"""Add the transactional audit_entries table.

Durable, authoritative record of REST/MCP mutations, written in the same
database transaction as the mutation it describes. The rotated file logger
added in #984 (app.audit.logger) remains as secondary, best-effort
operational telemetry only.

Revision ID: 005
Revises: 004
Create Date: 2026-08-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "actor_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_label", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("auth_source", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=False),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_entries_actor_user_id", "audit_entries", ["actor_user_id"])
    op.create_index("ix_audit_entries_created_at_id", "audit_entries", ["created_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_audit_entries_created_at_id", table_name="audit_entries")
    op.drop_index("ix_audit_entries_actor_user_id", table_name="audit_entries")
    op.drop_table("audit_entries")
