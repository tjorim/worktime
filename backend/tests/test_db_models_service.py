"""Tests for SQLAlchemy table definitions, schemas, and DB service operations."""

from __future__ import annotations

from datetime import date, datetime, time

import pytest
import pytest_asyncio
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.db_service as db_service
from app.database.models import GanttTask
from app.schemas import (
    LabelCreate,
    TaskCreate,
    TaskUpdate,
    TemplateCreate,
    UserCreate,
    UserUpdate,
    WorkLocationCreate,
    GanttTaskCreate,
    GanttTaskUpdate,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    ValidationError as ServiceValidationError,
    authenticate_user,
    create_label,
    create_or_update_work_location,
    create_gantt_task,
    create_task,
    create_template,
    create_user,
    delete_label,
    delete_user,
    get_label,
    get_running_task,
    get_task,
    get_template,
    list_users,
    list_tasks,
    update_gantt_task,
    update_task,
    update_user,
)


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

    with pytest.raises(PydanticValidationError, match="end_date cannot be earlier than start_date"):
        GanttTaskCreate(
            name="Impossible range",
            start_date=date(2026, 3, 8),
            end_date=date(2026, 3, 1),
            progress=10,
        )

    with pytest.raises(PydanticValidationError, match="end_date cannot be earlier than start_date"):
        GanttTaskUpdate(
            start_date=date(2026, 3, 8),
            end_date=date(2026, 3, 1),
        )


async def test_list_users(db_session: AsyncSession) -> None:
    await create_user(db_session, UserCreate(username="alice-list-test", display_name="Alice", password="test-password-1"))
    await create_user(db_session, UserCreate(username="bob-list-test", display_name="Bob", password="test-password-1"))

    users, total = await list_users(db_session)
    assert len(users) == 2
    assert total == 2


async def test_list_users_validates_offset_and_limit(db_session: AsyncSession) -> None:
    await create_user(db_session, UserCreate(username="limit-test", display_name="Limit Test", password="test-password-1"))

    with pytest.raises(ServiceValidationError, match="offset must be >= 0"):
        await list_users(db_session, offset=-1)

    with pytest.raises(ServiceValidationError, match="limit must be >= 1"):
        await list_users(db_session, limit=0)

    with pytest.raises(ServiceValidationError, match="limit must be <= 1000"):
        await list_users(db_session, limit=1001)


async def test_authenticate_user_performs_dummy_verify_for_unknown_username(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str]] = []

    def fake_verify_password(plain: str, hashed: str) -> bool:
        calls.append((plain, hashed))
        return False

    async def fake_get_user_by_username(*_args, **_kwargs):
        return None

    monkeypatch.setattr(db_service, "get_user_by_username", fake_get_user_by_username)
    monkeypatch.setattr(db_service, "verify_password", fake_verify_password)

    with pytest.raises(ServiceValidationError, match="invalid credentials"):
        await authenticate_user(db_session, "missing-user", "test-password-1")

    assert calls == [("test-password-1", db_service._DUMMY_PASSWORD_HASH)]


async def test_create_task_blocks_multiple_running_tasks(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="alice", display_name="Alice", password="test-password-1"))
    label = await create_label(db_session, user.id, LabelCreate(name="Deep work", color="#112233"))

    await create_task(
        db_session,
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
        await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Task B",
                label_id=label.id,
                start_time=datetime(2026, 2, 26, 10, 0),
                stop_time=None,
                includes_break=False,
            ),
        )


async def test_create_task_rejects_negative_duration(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="neg-duration", display_name="Neg Duration", password="test-password-1"))

    with pytest.raises(ServiceValidationError):
        await create_task(
            db_session,
            user.id,
            TaskCreate(
                text="Bad interval",
                start_time=datetime(2026, 2, 26, 12, 0),
                stop_time=datetime(2026, 2, 26, 11, 0),
                includes_break=False,
            ),
        )


async def test_update_task_rejects_negative_duration_with_partial_data(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="update-neg-duration", display_name="Update Neg", password="test-password-1"))
    task = await create_task(
        db_session,
        user.id,
        TaskCreate(
            text="Task",
            start_time=datetime(2026, 2, 26, 9, 0),
            stop_time=datetime(2026, 2, 26, 10, 0),
            includes_break=False,
        ),
    )

    with pytest.raises(ServiceValidationError):
        await update_task(
            db_session,
            user.id,
            task.id,
            TaskUpdate.model_construct(stop_time=datetime(2026, 2, 26, 8, 30)),
        )


async def test_update_user_rejects_null_for_non_nullable_fields(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="nullable-check", display_name="Nullable Check", password="test-password-1"))

    with pytest.raises(ServiceValidationError):
        await update_user(db_session, user.id, UserUpdate.model_construct(display_name=None))


async def test_delete_label_unlabels_tasks_and_templates(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="bob", display_name="Bob", password="test-password-1"))
    label = await create_label(db_session, user.id, LabelCreate(name="Ops", color="#445566"))

    task = await create_task(
        db_session,
        user.id,
        TaskCreate(
            text="Deploy",
            label_id=label.id,
            start_time=datetime(2026, 2, 26, 12, 0),
            stop_time=datetime(2026, 2, 26, 13, 0),
            includes_break=False,
        ),
    )
    template = await create_template(
        db_session,
        user.id,
        TemplateCreate(
            text="Deploy template",
            label_id=label.id,
            start_time=time(8, 0),
            stop_time=time(16, 0),
        ),
    )

    await delete_label(db_session, user.id, label.id)

    tasks = await list_tasks(db_session, user_id=user.id)
    assert len(tasks) == 1
    assert tasks[0].id == task.id
    assert tasks[0].label_id is None
    assert await get_running_task(db_session, user.id) is None

    persisted_template = await get_template(db_session, user.id, template.id)
    assert persisted_template.label_id is None


async def test_work_location_upsert(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="carol", display_name="Carol", password="test-password-1"))

    first = await create_or_update_work_location(
        db_session,
        user.id,
        WorkLocationCreate(
            date=date(2026, 2, 26),
            country_code="nl",
            label=None,
        ),
    )
    second = await create_or_update_work_location(
        db_session,
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


async def test_delete_user_removes_gantt_tasks(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="gantt-owner", display_name="Gantt Owner", password="test-password-1"))

    await create_gantt_task(
        db_session,
        user.id,
        GanttTaskCreate(
            name="Delivery window",
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 8),
            progress=40,
        ),
    )

    result = await db_session.execute(select(GanttTask).where(GanttTask.user_id == user.id))
    assert result.scalar_one_or_none() is not None

    await delete_user(db_session, user.id)

    result = await db_session.execute(select(GanttTask).where(GanttTask.user_id == user.id))
    assert result.scalar_one_or_none() is None


async def test_gantt_task_create_rejects_invalid_date_range(db_session: AsyncSession) -> None:
    user = await create_user(
        db_session,
        UserCreate(
            username="gantt-invalid-create",
            display_name="Gantt Invalid Create",
            password="test-password-1",
        ),
    )

    with pytest.raises(ServiceValidationError, match="end_date cannot be earlier than start_date"):
        await create_gantt_task(
            db_session,
            user.id,
            GanttTaskCreate.model_construct(
                name="Impossible range",
                start_date=date(2026, 3, 8),
                end_date=date(2026, 3, 1),
                progress=10,
            ),
        )


async def test_gantt_task_update_rejects_invalid_date_range(db_session: AsyncSession) -> None:
    user = await create_user(
        db_session,
        UserCreate(
            username="gantt-invalid-update",
            display_name="Gantt Invalid Update",
            password="test-password-1",
        ),
    )
    task = await create_gantt_task(
        db_session,
        user.id,
        GanttTaskCreate(
            name="Planning",
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 8),
            progress=25,
        ),
    )

    with pytest.raises(ServiceValidationError, match="end_date cannot be earlier than start_date"):
        await update_gantt_task(
            db_session,
            user.id,
            task.id,
            GanttTaskUpdate.model_construct(start_date=date(2026, 3, 10)),
        )


def test_template_time_types_can_be_constructed() -> None:
    assert time(8, 30).isoformat() == "08:30:00"


async def test_get_label_is_scoped_to_user(db_session: AsyncSession) -> None:
    owner = await create_user(db_session, UserCreate(username="owner", display_name="Owner", password="test-password-1"))
    other = await create_user(db_session, UserCreate(username="other", display_name="Other", password="test-password-1"))
    label = await create_label(db_session, owner.id, LabelCreate(name="Private", color="#123456"))

    fetched = await get_label(db_session, owner.id, label.id)
    assert fetched.id == label.id

    with pytest.raises(NotFoundError):
        await get_label(db_session, other.id, label.id)


async def test_get_task_is_scoped_to_user(db_session: AsyncSession) -> None:
    owner = await create_user(db_session, UserCreate(username="task_owner", display_name="Task Owner", password="test-password-1"))
    other = await create_user(db_session, UserCreate(username="task_other", display_name="Task Other", password="test-password-1"))

    task = await create_task(
        db_session,
        owner.id,
        TaskCreate(
            text="Private task",
            start_time=datetime(2026, 5, 1, 9, 0),
            stop_time=None,
            includes_break=False,
        ),
    )

    fetched = await get_task(db_session, owner.id, task.id)
    assert fetched.id == task.id

    with pytest.raises(NotFoundError):
        await get_task(db_session, other.id, task.id)


async def test_get_template_is_scoped_to_user(db_session: AsyncSession) -> None:
    owner = await create_user(db_session, UserCreate(username="tpl_owner", display_name="Tpl Owner", password="test-password-1"))
    other = await create_user(db_session, UserCreate(username="tpl_other", display_name="Tpl Other", password="test-password-1"))

    template = await create_template(
        db_session,
        owner.id,
        TemplateCreate(
            text="Reusable",
            start_time=time(9, 0),
            stop_time=time(17, 0),
        ),
    )

    fetched = await get_template(db_session, owner.id, template.id)
    assert fetched.id == template.id

    with pytest.raises(NotFoundError):
        await get_template(db_session, other.id, template.id)
