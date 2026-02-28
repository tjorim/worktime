"""SQLModel database table definitions for Worktime persistence."""

from datetime import date as dt_date, datetime as dt_datetime, time as dt_time, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Column, Date, DateTime, Index, UniqueConstraint, func, text
from sqlmodel import Field, Relationship, SQLModel


def _utc_now() -> dt_datetime:
    return dt_datetime.now(timezone.utc)


class User(SQLModel, table=True):
    """User account and preferences."""

    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    is_admin: bool = Field(default=False)
    hashed_password: str
    display_name: str
    settings: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    created_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        ),
    )

    labels: list["TimeTrackingLabel"] = Relationship(back_populates="user")
    tasks: list["TimeTrackingTask"] = Relationship(back_populates="user")
    templates: list["TimeTrackingTemplate"] = Relationship(back_populates="user")
    work_locations: list["WorkLocation"] = Relationship(back_populates="user")
    gantt_tasks: list["GanttTask"] = Relationship(back_populates="user")


class TimeTrackingLabel(SQLModel, table=True):
    """Time tracking label for categorizing tasks and templates."""

    __tablename__ = "time_tracking_labels"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    color: str
    created_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
            index=True,
        ),
    )
    deleted_at: dt_datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )

    user: User = Relationship(back_populates="labels")
    tasks: list["TimeTrackingTask"] = Relationship(back_populates="label")
    templates: list["TimeTrackingTemplate"] = Relationship(back_populates="label")

    __table_args__ = (
        Index(
            "ix_unique_active_label_user_name",
            "user_id",
            "name",
            unique=True,
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )


class TimeTrackingTask(SQLModel, table=True):
    """Tracked work task entry."""

    __tablename__ = "time_tracking_tasks"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    label_id: str | None = Field(default=None, foreign_key="time_tracking_labels.id", index=True)
    text: str
    start_time: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    stop_time: dt_datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    includes_break: bool = Field(default=False)
    created_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
            index=True,
        ),
    )
    deleted_at: dt_datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )

    user: User = Relationship(back_populates="tasks")
    label: TimeTrackingLabel | None = Relationship(back_populates="tasks")


class TimeTrackingTemplate(SQLModel, table=True):
    """Reusable time tracking template."""

    __tablename__ = "time_tracking_templates"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    label_id: str | None = Field(default=None, foreign_key="time_tracking_labels.id", index=True)
    text: str
    start_time: dt_time
    stop_time: dt_time
    created_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
            index=True,
        ),
    )
    deleted_at: dt_datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )

    user: User = Relationship(back_populates="templates")
    label: TimeTrackingLabel | None = Relationship(back_populates="templates")


class WorkLocation(SQLModel, table=True):
    """Per-day country assignment for where a user worked."""

    __tablename__ = "work_locations"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    date: dt_date = Field(index=True)
    country_code: str = Field(max_length=2)
    label: str | None = None
    created_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
            index=True,
        ),
    )
    deleted_at: dt_datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )

    user: User = Relationship(back_populates="work_locations")

    __table_args__ = (
        Index(
            "ix_unique_active_work_location_user_date",
            "user_id",
            "date",
            unique=True,
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )


class GanttTask(SQLModel, table=True):
    """Personal Gantt chart task."""

    __tablename__ = "gantt_tasks"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    start_date: dt_date = Field(sa_column=Column(Date(), nullable=False))
    end_date: dt_date = Field(sa_column=Column(Date(), nullable=False))
    progress: int = Field(default=0)
    dependencies: str | None = Field(default=None)
    notes: str | None = Field(default=None)
    created_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: dt_datetime = Field(
        default_factory=_utc_now,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
            index=True,
        ),
    )
    deleted_at: dt_datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )

    user: "User" = Relationship(back_populates="gantt_tasks")
