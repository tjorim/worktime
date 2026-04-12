"""Make language nullable in cached_holidays to support Nager.At public holidays.

Nager.At always returns both English and native names without a language
parameter, so public holiday cache entries use language=NULL.

Revision ID: 003
Revises: 002
Create Date: 2026-04-12
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("cached_holidays", "language", nullable=True)


def downgrade() -> None:
    # Rows with NULL language (Nager public holidays) must be removed or
    # back-filled before downgrading, as the column becomes NOT NULL again.
    op.execute("DELETE FROM cached_holidays WHERE language IS NULL")
    op.alter_column("cached_holidays", "language", nullable=False)
