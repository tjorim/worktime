"""Migrate from SuperTokens to OIDC: rename supertokens_user_id to oidc_subject.

Revision ID: 002
Revises: 001
Create Date: 2026-05-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Rename the column
    op.alter_column("users", "supertokens_user_id", new_column_name="oidc_subject")
    # Make it nullable (existing rows keep their values; new rows may not have a subject yet)
    op.alter_column("users", "oidc_subject", nullable=True)
    # Rename the index
    op.drop_index("ix_users_supertokens_user_id", table_name="users")
    op.create_index("ix_users_oidc_subject", "users", ["oidc_subject"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_oidc_subject", table_name="users")
    op.alter_column("users", "oidc_subject", nullable=False)
    op.alter_column("users", "oidc_subject", new_column_name="supertokens_user_id")
    op.create_index("ix_users_supertokens_user_id", "users", ["supertokens_user_id"], unique=True)
