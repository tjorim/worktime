"""Tests for SQLModel table definitions, schemas, and DB service operations."""

from __future__ import annotations

from datetime import date, datetime, time

import pytest
from pydantic import ValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models.db_schemas import (
    LabelCreate,
    TaskCreate,
    UserCreate,
    WorkLocationCreate
)
from app.services.db_service import (
    ConflictError,
    create_label,
    create_or_update_work_location,
    create_task,
    create_user,
    delete_label,
    get_running_task,
    list_tasks
)


@pytest.fixture()
def session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db_session:
        yield db_session


def test_schema_validates_color_and_country_code() -> None:
    with pytest.raises(ValidationError):
        LabelCreate(name="Client", color="#12")

    with pytest.raises(ValidationError):
        WorkLocationCreate(
            date=date(2026, 2, 26),
            country_code="NET",
        )


def test_create_task_blocks_multiple_running_tasks(session: Session) -> None:
    user = create_user(session, UserCreate(username="alice", display_name="Alice"))
    label = create_label(session, user.id, LabelCreate(name="Deep work", color="#112233"))

    create_task(
        session,
        user.id,
        TaskCreate(
            text="Task A",
            label_id=label.id,
            start_time=datetime(2026, 2, 26, 9, 0),
            stop_time=None,
            includes_break=False,
        ),
    )

    with pytest.raises(ConflictError):
        create_task(
            session,
            user.id,
            TaskCreate(
                text="Task B",
                label_id=label.id,
                start_time=datetime(2026, 2, 26, 10, 0),
                stop_time=None,
                includes_break=False,
            ),
        )


def test_delete_label_cascades_to_tasks(session: Session) -> None:
    user = create_user(session, UserCreate(username="bob", display_name="Bob"))
    label = create_label(session, user.id, LabelCreate(name="Ops", color="#445566"))

    create_task(
        session,
        user.id,
        TaskCreate(
            text="Deploy",
            label_id=label.id,
            start_time=datetime(2026, 2, 26, 12, 0),
            stop_time=datetime(2026, 2, 26, 13, 0),
            includes_break=False,
        ),
    )

    delete_label(session, user.id, label.id)

    assert list_tasks(session, user_id=user.id) == []
    assert get_running_task(session, user.id) is None


def test_work_location_upsert(session: Session) -> None:
    user = create_user(session, UserCreate(username="carol", display_name="Carol"))

    first = create_or_update_work_location(
        session,
        user.id,
        WorkLocationCreate(
            date=date(2026, 2, 26),
            country_code="nl",
            label=None,
        ),
    )
    second = create_or_update_work_location(
        session,
        user.id,
        WorkLocationCreate(
            date=date(2026, 2, 26),
            country_code="be",
            label="Client office",
        ),
    )

    assert first.id == second.id
    assert second.country_code == "BE"
    assert second.label == "Client office"


def test_template_time_types_can_be_constructed() -> None:
    assert time(8, 30).isoformat() == "08:30:00"

