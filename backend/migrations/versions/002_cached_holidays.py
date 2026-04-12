"""Add cached_holidays table for DB-persisted holiday data.

Revision ID: 002
Revises: 001
Create Date: 2026-04-12
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cached_holidays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("holiday_type", sa.String(), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("subdivision", sa.String(), nullable=True),
        sa.Column("language", sa.String(2), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # Use NULLS NOT DISTINCT so that NULL subdivision values are treated as equal
    # for uniqueness purposes (PostgreSQL 15+).
    op.execute(
        """
        ALTER TABLE cached_holidays
        ADD CONSTRAINT uq_cached_holiday
        UNIQUE NULLS NOT DISTINCT (holiday_type, country, year, subdivision, language)
        """
    )


def downgrade() -> None:
    op.drop_constraint("uq_cached_holiday", "cached_holidays", type_="unique")
    op.drop_table("cached_holidays")
