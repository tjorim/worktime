"""Tests for SQLModel table definitions, schemas, and DB service operations."""

from __future__ import annotations

from datetime import date, datetime, time

import pytest
from pydantic import ValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database.models import TimeTrackingLabel, TimeTrackingTask, TimeTrackingTemplate
from app.models.db_schemas import (
    LabelCreate,
    TaskCreate,
    TemplateCreate,
    UserCreate,
    WorkLocationCreate,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    create_label,
    create_or_update_work_location,
    create_task,
    create_template,
    create_user,
    delete_label,
    get_label,
    get_running_task,
    get_task,
    get_template,
    list_tasks,
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


def test_delete_label_unlabels_tasks_and_templates(session: Session) -> None:
    user = create_user(session, UserCreate(username="bob", display_name="Bob"))
    label = create_label(session, user.id, LabelCreate(name="Ops", color="#445566"))

    task = create_task(
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
    template = create_template(
        session,
        user.id,
        TemplateCreate(
            text="Deploy template",
            label_id=label.id,
            start_time=time(8, 0),
            stop_time=time(16, 0),
        ),
    )

    delete_label(session, user.id, label.id)

    tasks = list_tasks(session, user_id=user.id)
    assert len(tasks) == 1
    assert tasks[0].id == task.id
    assert tasks[0].label_id is None
    assert get_running_task(session, user.id) is None

    persisted_template = get_template(session, user.id, template.id)
    assert persisted_template.label_id is None


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


def test_task_label_relationship_back_populates_pairing() -> None:
    assert TimeTrackingLabel.tasks.property.back_populates == "label"
    assert TimeTrackingTask.label.property.back_populates == "tasks"



def test_template_label_relationship_back_populates_pairing() -> None:
    assert TimeTrackingLabel.templates.property.back_populates == "label"
    assert TimeTrackingTemplate.label.property.back_populates == "templates"


def test_get_label_is_scoped_to_user(session: Session) -> None:
    owner = create_user(session, UserCreate(username="owner", display_name="Owner"))
    other = create_user(session, UserCreate(username="other", display_name="Other"))
    label = create_label(session, owner.id, LabelCreate(name="Private", color="#123456"))

    fetched = get_label(session, owner.id, label.id)
    assert fetched.id == label.id

    with pytest.raises(NotFoundError):
        get_label(session, other.id, label.id)


def test_get_task_is_scoped_to_user(session: Session) -> None:
    owner = create_user(session, UserCreate(username="task_owner", display_name="Task Owner"))
    other = create_user(session, UserCreate(username="task_other", display_name="Task Other"))

    task = create_task(
        session,
        owner.id,
        TaskCreate(
            text="Private task",
            start_time=datetime(2026, 5, 1, 9, 0),
            stop_time=None,
            includes_break=False,
        ),
    )

    fetched = get_task(session, owner.id, task.id)
    assert fetched.id == task.id

    with pytest.raises(NotFoundError):
        get_task(session, other.id, task.id)


def test_get_template_is_scoped_to_user(session: Session) -> None:
    owner = create_user(session, UserCreate(username="tpl_owner", display_name="Tpl Owner"))
    other = create_user(session, UserCreate(username="tpl_other", display_name="Tpl Other"))

    template = create_template(
        session,
        owner.id,
        TemplateCreate(
            text="Reusable",
            start_time=time(9, 0),
            stop_time=time(17, 0),
        ),
    )

    fetched = get_template(session, owner.id, template.id)
    assert fetched.id == template.id

    with pytest.raises(NotFoundError):
        get_template(session, other.id, template.id)
