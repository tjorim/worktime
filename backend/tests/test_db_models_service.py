"""Tests for SQLModel table definitions, schemas, and DB service operations."""

from __future__ import annotations

from datetime import date, datetime, time

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.services.db_service as db_service
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
    authenticate_user,
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


def test_list_users(session: Session) -> None:
    create_user(session, UserCreate(username="alice-list-test", display_name="Alice", password="test-password-1"))
    create_user(session, UserCreate(username="bob-list-test", display_name="Bob", password="test-password-1"))

    users, total = list_users(session)
    assert len(users) == 2
    assert total == 2


def test_list_users_validates_offset_and_limit(session: Session) -> None:
    create_user(session, UserCreate(username="limit-test", display_name="Limit Test", password="test-password-1"))

    with pytest.raises(ServiceValidationError, match="offset must be >= 0"):
        list_users(session, offset=-1)

    with pytest.raises(ServiceValidationError, match="limit must be >= 1"):
        list_users(session, limit=0)

    with pytest.raises(ServiceValidationError, match="limit must be <= 1000"):
        list_users(session, limit=1001)


def test_authenticate_user_performs_dummy_verify_for_unknown_username(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str]] = []

    def fake_verify_password(plain: str, hashed: str) -> bool:
        calls.append((plain, hashed))
        return False

    monkeypatch.setattr(db_service, "get_user_by_username", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(db_service, "verify_password", fake_verify_password)

    with pytest.raises(ServiceValidationError, match="invalid credentials"):
        authenticate_user(None, "missing-user", "test-password-1")  # type: ignore[arg-type]

    assert calls == [("test-password-1", db_service._DUMMY_PASSWORD_HASH)]


def test_create_task_blocks_multiple_running_tasks(session: Session) -> None:
    user = create_user(session, UserCreate(username="alice", display_name="Alice", password="test-password-1"))
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
    user = create_user(session, UserCreate(username="neg-duration", display_name="Neg Duration", password="test-password-1"))

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
    user = create_user(session, UserCreate(username="update-neg-duration", display_name="Update Neg", password="test-password-1"))
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
    user = create_user(session, UserCreate(username="nullable-check", display_name="Nullable Check", password="test-password-1"))

    with pytest.raises(ServiceValidationError):
        update_user(session, user.id, UserUpdate.model_construct(display_name=None))

def test_delete_label_unlabels_tasks_and_templates(session: Session) -> None:
    user = create_user(session, UserCreate(username="bob", display_name="Bob", password="test-password-1"))
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
    user = create_user(session, UserCreate(username="carol", display_name="Carol", password="test-password-1"))

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
    owner = create_user(session, UserCreate(username="owner", display_name="Owner", password="test-password-1"))
    other = create_user(session, UserCreate(username="other", display_name="Other", password="test-password-1"))
    label = create_label(session, owner.id, LabelCreate(name="Private", color="#123456"))

    fetched = get_label(session, owner.id, label.id)
    assert fetched.id == label.id

    with pytest.raises(NotFoundError):
        get_label(session, other.id, label.id)


def test_get_task_is_scoped_to_user(session: Session) -> None:
    owner = create_user(session, UserCreate(username="task_owner", display_name="Task Owner", password="test-password-1"))
    other = create_user(session, UserCreate(username="task_other", display_name="Task Other", password="test-password-1"))

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
    owner = create_user(session, UserCreate(username="tpl_owner", display_name="Tpl Owner", password="test-password-1"))
    other = create_user(session, UserCreate(username="tpl_other", display_name="Tpl Other", password="test-password-1"))

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
