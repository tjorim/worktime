"""Add supertokens_user_id column to users table.

Revision ID: 002
Revises: 001
Create Date: 2026-03-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("supertokens_user_id", sa.String(), nullable=True))
    op.create_index("ix_users_supertokens_user_id", "users", ["supertokens_user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_supertokens_user_id", table_name="users")
    op.drop_column("users", "supertokens_user_id")
