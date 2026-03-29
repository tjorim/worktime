"""Initial schema — all tables at final state.

Revision ID: 001
Revises:
Create Date: 2026-03-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "time_tracking_labels",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_time_tracking_labels_user_id", "time_tracking_labels", ["user_id"])
    op.create_index("ix_time_tracking_labels_updated_at", "time_tracking_labels", ["updated_at"])
    op.create_index("ix_time_tracking_labels_deleted_at", "time_tracking_labels", ["deleted_at"])
    op.create_index(
        "uq_active_label_user_name",
        "time_tracking_labels",
        ["user_id", "name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "time_tracking_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label_id", sa.String(), sa.ForeignKey("time_tracking_labels.id"), nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("stop_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("includes_break", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_time_tracking_tasks_user_id", "time_tracking_tasks", ["user_id"])
    op.create_index("ix_time_tracking_tasks_label_id", "time_tracking_tasks", ["label_id"])
    op.create_index("ix_time_tracking_tasks_updated_at", "time_tracking_tasks", ["updated_at"])
    op.create_index("ix_time_tracking_tasks_deleted_at", "time_tracking_tasks", ["deleted_at"])

    op.create_table(
        "time_tracking_templates",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label_id", sa.String(), sa.ForeignKey("time_tracking_labels.id"), nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("stop_time", sa.Time(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_time_tracking_templates_user_id", "time_tracking_templates", ["user_id"])
    op.create_index("ix_time_tracking_templates_label_id", "time_tracking_templates", ["label_id"])
    op.create_index("ix_time_tracking_templates_updated_at", "time_tracking_templates", ["updated_at"])
    op.create_index("ix_time_tracking_templates_deleted_at", "time_tracking_templates", ["deleted_at"])

    op.create_table(
        "work_locations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_work_locations_user_id", "work_locations", ["user_id"])
    op.create_index("ix_work_locations_date", "work_locations", ["date"])
    op.create_index("ix_work_locations_updated_at", "work_locations", ["updated_at"])
    op.create_index("ix_work_locations_deleted_at", "work_locations", ["deleted_at"])
    op.create_index(
        "uq_active_work_location_user_date",
        "work_locations",
        ["user_id", "date"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "gantt_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("dependencies", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_gantt_tasks_user_id", "gantt_tasks", ["user_id"])
    op.create_index("ix_gantt_tasks_updated_at", "gantt_tasks", ["updated_at"])


def downgrade() -> None:
    op.drop_table("gantt_tasks")
    op.drop_table("work_locations")
    op.drop_table("time_tracking_templates")
    op.drop_table("time_tracking_tasks")
    op.drop_table("time_tracking_labels")
    op.drop_table("users")
