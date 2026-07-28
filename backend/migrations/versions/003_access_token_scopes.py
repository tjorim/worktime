"""Add explicit least-privilege scopes to access tokens.

Revision ID: 003
Revises: 002
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing credentials were read-only in application code. Preserve that
    # behavior while making the authorization contract explicit.
    op.add_column(
        "access_tokens",
        sa.Column(
            "scopes",
            sa.JSON(),
            nullable=False,
            server_default='["pebble:read"]',
        ),
    )


def downgrade() -> None:
    op.drop_column("access_tokens", "scopes")
