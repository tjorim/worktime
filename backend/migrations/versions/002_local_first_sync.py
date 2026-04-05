"""Add user_preferences and structured time_off_entries tables for local-first sync.

Revision ID: 002
Revises: 001
Create Date: 2026-04-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_preferences_updated_at", "user_preferences", ["updated_at"])

    op.create_table(
        "time_off_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default=sa.text("'date'")),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("entry_type", sa.String(), nullable=False, server_default=sa.text("'vacation'")),
        sa.Column("flags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_time_off_entries_user_id", "time_off_entries", ["user_id"])
    op.create_index("ix_time_off_entries_entry_id", "time_off_entries", ["entry_id"])
    op.create_index("ix_time_off_entries_date", "time_off_entries", ["date"])
    op.create_index("ix_time_off_entries_start_date", "time_off_entries", ["start_date"])
    op.create_index("ix_time_off_entries_end_date", "time_off_entries", ["end_date"])
    op.create_index("ix_time_off_entries_weekday", "time_off_entries", ["weekday"])
    op.create_index("ix_time_off_entries_updated_at", "time_off_entries", ["updated_at"])
    op.create_index("ix_time_off_entries_deleted_at", "time_off_entries", ["deleted_at"])
    op.create_index(
        "uq_time_off_user_entry_id",
        "time_off_entries",
        ["user_id", "entry_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_time_off_user_entry_id", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_deleted_at", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_updated_at", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_weekday", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_end_date", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_start_date", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_date", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_entry_id", table_name="time_off_entries")
    op.drop_index("ix_time_off_entries_user_id", table_name="time_off_entries")
    op.drop_table("time_off_entries")
    op.drop_index("ix_user_preferences_updated_at", table_name="user_preferences")
    op.drop_table("user_preferences")
