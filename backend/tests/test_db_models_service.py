"""Tests for SQLModel table definitions, schemas, and DB service operations."""

from __future__ import annotations

from datetime import date, datetime, time

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database.models import TimeTrackingLabel, TimeTrackingTask, TimeTrackingTemplate
from app.models.db_schemas import (
    LabelCreate,
    TaskCreate,
    TaskUpdate,
    TemplateCreate,
    UserCreate,
    UserUpdate,
    WorkLocationCreate,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    ValidationError as ServiceValidationError,
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
    list_users,
    list_tasks,
    update_task,
    update_user,
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
    with pytest.raises(PydanticValidationError):
        LabelCreate(name="Client", color="#12")

    with pytest.raises(PydanticValidationError):
        LabelCreate(name="Client", color="#12GG34")

    with pytest.raises(PydanticValidationError):
        WorkLocationCreate(
            date=date(2026, 2, 26),
            country_code="NET",
        )

    with pytest.raises(PydanticValidationError):
        WorkLocationCreate(
            date=date(2026, 2, 26),
            country_code="ZZ",
        )


def test_list_users_requires_admin_scope(session: Session) -> None:
    create_user(session, UserCreate(username="alice-admin-test", display_name="Alice"))
    create_user(session, UserCreate(username="bob-admin-test", display_name="Bob"))

    with pytest.raises(ServiceValidationError):
        list_users(session)

    users, total = list_users(session, is_admin=True)
    assert len(users) == 2
    assert total == 2


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



def test_create_task_rejects_negative_duration(session: Session) -> None:
    user = create_user(session, UserCreate(username="neg-duration", display_name="Neg Duration"))

    with pytest.raises(ServiceValidationError):
        create_task(
            session,
            user.id,
            TaskCreate(
                text="Bad interval",
                start_time=datetime(2026, 2, 26, 12, 0),
                stop_time=datetime(2026, 2, 26, 11, 0),
                includes_break=False,
            ),
        )


def test_update_task_rejects_negative_duration_with_partial_data(session: Session) -> None:
    user = create_user(session, UserCreate(username="update-neg-duration", display_name="Update Neg"))
    task = create_task(
        session,
        user.id,
        TaskCreate(
            text="Task",
            start_time=datetime(2026, 2, 26, 9, 0),
            stop_time=datetime(2026, 2, 26, 10, 0),
            includes_break=False,
        ),
    )

    with pytest.raises(ServiceValidationError):
        update_task(
            session,
            user.id,
            task.id,
            TaskUpdate.model_construct(stop_time=datetime(2026, 2, 26, 8, 30)),
        )


def test_update_user_rejects_null_for_non_nullable_fields(session: Session) -> None:
    user = create_user(session, UserCreate(username="nullable-check", display_name="Nullable Check"))

    with pytest.raises(ServiceValidationError):
        update_user(session, user.id, UserUpdate.model_construct(display_name=None))

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
