"""Initial schema — all tables at final state, including OIDC integration.

Revision ID: 001
Revises:
Create Date: 2026-04-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SYNCED_TABLES = (
    "time_tracking_labels",
    "time_tracking_tasks",
    "time_tracking_templates",
    "work_locations",
    "gantt_tasks",
    "time_off_entries",
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("oidc_subject", sa.String(), nullable=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_oidc_subject", "users", ["oidc_subject"], unique=True)

    op.create_table(
        "time_tracking_labels",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
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
        "gantt_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("dependencies", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_gantt_tasks_user_id", "gantt_tasks", ["user_id"])
    op.create_index("ix_gantt_tasks_updated_at", "gantt_tasks", ["updated_at"])
    op.create_index("ix_gantt_tasks_deleted_at", "gantt_tasks", ["deleted_at"])

    op.create_table(
        "time_tracking_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label_id", sa.String(), sa.ForeignKey("time_tracking_labels.id"), nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("stop_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("includes_break", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "gantt_task_id",
            sa.String(),
            sa.ForeignKey("gantt_tasks.id", name="fk_time_tracking_tasks_gantt_task_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_time_tracking_tasks_user_id", "time_tracking_tasks", ["user_id"])
    op.create_index("ix_time_tracking_tasks_label_id", "time_tracking_tasks", ["label_id"])
    op.create_index("ix_time_tracking_tasks_updated_at", "time_tracking_tasks", ["updated_at"])
    op.create_index("ix_time_tracking_tasks_deleted_at", "time_tracking_tasks", ["deleted_at"])
    op.create_index("ix_time_tracking_tasks_gantt_task_id", "time_tracking_tasks", ["gantt_task_id"])

    op.create_table(
        "time_tracking_templates",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label_id", sa.String(), sa.ForeignKey("time_tracking_labels.id"), nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("stop_time", sa.Time(), nullable=False),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
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
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
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
        sa.Column("entry_kind", sa.String(), nullable=False, server_default=sa.text("'date'")),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("entry_type", sa.String(), nullable=False, server_default=sa.text("'vacation'")),
        sa.Column("entry_flag", sa.String(), nullable=False, server_default=sa.text("'full_day'")),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        # Defined inline (rather than via op.create_check_constraint after the
        # table already exists) so this table creates cleanly on SQLite too:
        # SQLite has no ALTER TABLE ADD CONSTRAINT at all, only batch mode's
        # copy-and-move — pointless right after a fresh CREATE TABLE, and
        # inline constraints need no such workaround on any dialect.
        sa.CheckConstraint("entry_kind IN ('date', 'range', 'weekly')", name="ck_time_off_entry_kind"),
        sa.CheckConstraint(
            "entry_type IN ('vacation','business','course','in','weekend','birthday','ill','other')",
            name="ck_time_off_entry_type",
        ),
        sa.CheckConstraint(
            "entry_flag IN ('full_day','half_am','half_pm','onsite','no_fly','can_fly')",
            name="ck_time_off_entry_flag",
        ),
        sa.CheckConstraint("weekday BETWEEN 1 AND 7 OR weekday IS NULL", name="ck_time_off_weekday_range"),
        sa.CheckConstraint(
            "(entry_kind = 'date' AND date IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND weekday IS NULL)"
            " OR (entry_kind = 'range' AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date < end_date AND date IS NULL AND weekday IS NULL)"
            " OR (entry_kind = 'weekly' AND weekday IS NOT NULL AND date IS NULL AND start_date IS NULL AND end_date IS NULL)",
            name="ck_time_off_shape",
        ),
    )
    op.create_index("ix_time_off_entries_user_id", "time_off_entries", ["user_id"])
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

    op.create_table(
        "cached_holidays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("holiday_type", sa.String(), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("subdivision", sa.String(), nullable=True),
        sa.Column("language", sa.String(2), nullable=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # NULLS NOT DISTINCT is Postgres-only syntax (no SQLite equivalent, and
    # not expressible as a plain sa.UniqueConstraint either) — under SQLite
    # (local dev only, no Postgres container needed) fall back to a plain
    # UNIQUE constraint, which treats NULLs as distinct. That's a looser
    # guarantee than production gets, but acceptable for local dev.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            ALTER TABLE cached_holidays
            ADD CONSTRAINT uq_cached_holiday
            UNIQUE NULLS NOT DISTINCT (holiday_type, country, year, subdivision, language)
            """
        )
    else:
        # SQLite has no standalone ALTER TABLE ADD CONSTRAINT — batch mode's
        # copy-and-move strategy is required even right after a fresh
        # CREATE TABLE.
        with op.batch_alter_table("cached_holidays") as batch_op:
            batch_op.create_unique_constraint(
                "uq_cached_holiday",
                ["holiday_type", "country", "year", "subdivision", "language"],
            )

    # Composite indexes for the hot sync-pull and task-listing queries.
    # pull_changes filters every synced table on (user_id, updated_at > since);
    # list_tasks additionally sorts by start_time within a user_id filter.
    for table in _SYNCED_TABLES:
        op.create_index(
            f"ix_{table}_user_id_updated_at",
            table,
            ["user_id", "updated_at"],
        )
    op.create_index(
        "ix_time_tracking_tasks_user_id_start_time",
        "time_tracking_tasks",
        ["user_id", "start_time"],
    )


def downgrade() -> None:
    # No separate drop_constraint/drop_index calls needed for constraints or
    # indexes defined on a table: dropping the table removes them too (true
    # on every dialect, including SQLite, which has no standalone "drop
    # constraint" operation).
    op.drop_table("cached_holidays")
    op.drop_table("time_off_entries")
    op.drop_table("user_preferences")
    op.drop_table("work_locations")
    op.drop_table("time_tracking_templates")
    op.drop_table("time_tracking_tasks")
    op.drop_table("gantt_tasks")
    op.drop_table("time_tracking_labels")
    op.drop_table("users")
