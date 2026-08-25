"""Tests for SQLAlchemy table definitions, schemas, and DB service operations."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime, time

import pytest
import pytest_asyncio
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import func, select
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.database.models import (
    GanttTask,
    Label,
    TimeOffEntry,
    TimeTrackingTask,
    TimeTrackingTemplate,
    UserPreferences,
    WorkLocation,
)
from app.schemas import (
    GanttTaskCreate,
    GanttTaskUpdate,
    LabelCreate,
    TaskCreate,
    TaskUpdate,
    TemplateCreate,
    TimeOffEntryCreate,
    UserCreate,
    UserPreferencesWrite,
    UserUpdate,
    WorkLocationCreate,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    create_gantt_task,
    create_label,
    create_or_update_time_off_entry,
    create_or_update_work_location,
    create_task,
    create_template,
    create_user,
    delete_gantt_task,
    delete_label,
    delete_task,
    delete_template,
    delete_user,
    delete_work_location,
    get_gantt_task,
    get_label,
    get_running_task,
    get_task,
    get_template,
    get_work_location,
    list_gantt_tasks,
    list_labels_for_user,
    list_tasks,
    list_templates_for_user,
    list_users,
    list_work_locations,
    update_gantt_task,
    update_task,
    update_user,
    upsert_user_preferences,
)
from app.services.db_service import (
    ValidationError as ServiceValidationError,
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
    await create_user(db_session, UserCreate(username="alice-list-test", display_name="Alice"))
    await create_user(db_session, UserCreate(username="bob-list-test", display_name="Bob"))

    users, total = await list_users(db_session)
    assert len(users) == 2
    assert total == 2


async def test_list_users_validates_offset_and_limit(db_session: AsyncSession) -> None:
    await create_user(db_session, UserCreate(username="limit-test", display_name="Limit Test"))

    with pytest.raises(ServiceValidationError, match="offset must be >= 0"):
        await list_users(db_session, offset=-1)

    with pytest.raises(ServiceValidationError, match="limit must be >= 1"):
        await list_users(db_session, limit=0)

    with pytest.raises(ServiceValidationError, match="limit must be <= 1000"):
        await list_users(db_session, limit=1001)


async def test_create_task_blocks_multiple_running_tasks(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="alice", display_name="Alice"))
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


@pytest_asyncio.fixture()
async def without_running_task_index(test_db: AsyncEngine) -> AsyncGenerator[None, None]:
    """Drop uq_active_running_task_user for one test and always restore it.

    Uses test_db's own connection for both drop and restore, rather than the
    test's db_session: `_schema_engine` creates the schema once per test
    session, so a restore that depends on the test's own session ending in a
    healthy, non-aborted state could leave the index missing for every later
    test in the session if that test's own logic ever left its transaction
    aborted first.
    """
    async with test_db.begin() as conn:
        await conn.execute(sql_text("DROP INDEX uq_active_running_task_user"))
    try:
        yield
    finally:
        async with test_db.begin() as conn:
            # Recreating the index requires the table to satisfy it again first.
            await conn.execute(sql_text("DELETE FROM time_tracking_tasks"))
            await conn.execute(
                sql_text(
                    "CREATE UNIQUE INDEX uq_active_running_task_user ON time_tracking_tasks (user_id) "
                    "WHERE stop_time IS NULL AND deleted_at IS NULL"
                )
            )


async def test_get_running_task_degrades_to_most_recent_on_pre_existing_duplicates(
    db_session: AsyncSession,
    without_running_task_index: None,
) -> None:
    """`get_running_task` must not crash on an account that already has two running tasks.

    `create_task`/`update_task` block a second running task, but the sync push
    path historically didn't (see #1100), so some accounts may already have
    more than one `stop_time IS NULL` row. `get_running_task` used to call
    `scalar_one_or_none()`, which raises `MultipleResultsFound` in that case,
    turning every read that resolves the running task into a 500. It must
    instead return the most recently started one.

    The partial unique index added alongside this fix (uq_active_running_task_user)
    prevents a *new* account from reaching this state, so the
    without_running_task_index fixture drops it for the duration of this test
    to reproduce the pre-migration-repair state that existing production data
    may still be in when this code first ships.
    """
    user = await create_user(db_session, UserCreate(username="dup-running", display_name="Dup Running"))

    older = TimeTrackingTask(
        user_id=user.id,
        text="Older running task",
        start_time=datetime(2026, 2, 26, 9, 0, tzinfo=UTC),
        stop_time=None,
    )
    newer = TimeTrackingTask(
        user_id=user.id,
        text="Newer running task",
        start_time=datetime(2026, 2, 26, 10, 0, tzinfo=UTC),
        stop_time=None,
    )
    db_session.add_all([older, newer])
    await db_session.commit()

    running = await get_running_task(db_session, user.id)
    assert running is not None
    assert running.id == newer.id


async def test_create_task_rejects_negative_duration(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="neg-duration", display_name="Neg Duration"))

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
    user = await create_user(db_session, UserCreate(username="update-neg-duration", display_name="Update Neg"))
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


async def test_update_task_resets_reminder_on_an_actual_reschedule(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="reschedule-reset", display_name="Reschedule"))
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
    task.reminder_sent_at = datetime(2026, 2, 26, 8, 50, tzinfo=UTC)
    db_session.add(task)
    await db_session.commit()

    updated = await update_task(
        db_session,
        user.id,
        task.id,
        TaskUpdate.model_construct(start_time=datetime(2026, 2, 26, 9, 30)),
    )

    assert updated.reminder_sent_at is None


async def test_update_task_does_not_reset_reminder_when_start_time_is_unchanged(db_session: AsyncSession) -> None:
    """A client resending the same start_time alongside an unrelated edit (e.g. text)
    must not requeue an already-sent reminder into a duplicate notification.
    """
    user = await create_user(db_session, UserCreate(username="reschedule-noop", display_name="No Reschedule"))
    start_time = datetime(2026, 2, 26, 9, 0)
    task = await create_task(
        db_session,
        user.id,
        TaskCreate(text="Task", start_time=start_time, stop_time=datetime(2026, 2, 26, 10, 0), includes_break=False),
    )
    sent_at = datetime(2026, 2, 26, 8, 50, tzinfo=UTC)
    task.reminder_sent_at = sent_at
    db_session.add(task)
    await db_session.commit()

    updated = await update_task(
        db_session,
        user.id,
        task.id,
        TaskUpdate.model_construct(text="Renamed", start_time=start_time),
    )

    assert updated.reminder_sent_at == sent_at


async def test_update_user_rejects_null_for_non_nullable_fields(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="nullable-check", display_name="Nullable Check"))

    with pytest.raises(ServiceValidationError):
        await update_user(db_session, user.id, UserUpdate.model_construct(display_name=None))


async def test_delete_label_blocked_when_in_use(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="bob", display_name="Bob"))
    label = await create_label(db_session, user.id, LabelCreate(name="Ops", color="#445566"))

    await create_task(
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
    await create_template(
        db_session,
        user.id,
        TemplateCreate(
            text="Deploy template",
            label_id=label.id,
            start_time=time(8, 0),
            stop_time=time(16, 0),
        ),
    )

    with pytest.raises(ConflictError, match="label is in use"):
        await delete_label(db_session, user.id, label.id)


async def test_delete_label_blocked_when_referenced_by_gantt_task(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="bob-gantt", display_name="Bob Gantt"))
    label = await create_label(db_session, user.id, LabelCreate(name="Launch", color="#334455"))

    await create_gantt_task(
        db_session,
        user.id,
        GanttTaskCreate(
            name="Launch prep",
            label_id=label.id,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 8),
        ),
    )

    with pytest.raises(ConflictError, match="label is in use"):
        await delete_label(db_session, user.id, label.id)


async def test_delete_label_succeeds_when_only_referenced_by_deleted_gantt_task(
    db_session: AsyncSession,
) -> None:
    user = await create_user(db_session, UserCreate(username="bob-gantt2", display_name="Bob Gantt 2"))
    label = await create_label(db_session, user.id, LabelCreate(name="Launch2", color="#556677"))
    task = await create_gantt_task(
        db_session,
        user.id,
        GanttTaskCreate(
            name="Launch prep 2",
            label_id=label.id,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 8),
        ),
    )
    await delete_gantt_task(db_session, user.id, task.id)

    await delete_label(db_session, user.id, label.id)

    labels = await list_labels_for_user(db_session, user.id)
    assert not any(item.id == label.id for item in labels)


async def test_gantt_task_label_reference_is_validated(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="bob-gantt3", display_name="Bob Gantt 3"))

    with pytest.raises(NotFoundError, match="label not found"):
        await create_gantt_task(
            db_session,
            user.id,
            GanttTaskCreate(
                name="Bad label",
                label_id="does-not-exist",
                start_date=date(2026, 3, 1),
                end_date=date(2026, 3, 8),
            ),
        )

    task = await create_gantt_task(
        db_session,
        user.id,
        GanttTaskCreate(
            name="Retitle me",
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 8),
        ),
    )
    with pytest.raises(NotFoundError, match="label not found"):
        await update_gantt_task(
            db_session,
            user.id,
            task.id,
            GanttTaskUpdate(label_id="does-not-exist"),
        )


async def test_delete_label_succeeds_when_unused(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="bob2", display_name="Bob2"))
    label = await create_label(db_session, user.id, LabelCreate(name="Unused", color="#aabbcc"))

    await delete_label(db_session, user.id, label.id)

    labels = await list_labels_for_user(db_session, user.id)
    assert not any(item.id == label.id for item in labels)


async def test_work_location_upsert(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="carol", display_name="Carol"))

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


async def test_delete_user_removes_all_user_scoped_rows(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="delete-owner", display_name="Delete Owner"))

    label = await create_label(db_session, user.id, LabelCreate(name="Delete Label", color="#112233"))
    await create_task(
        db_session,
        user.id,
        TaskCreate(
            text="Delete task",
            label_id=label.id,
            start_time=datetime(2026, 3, 1, 9, 0),
            stop_time=datetime(2026, 3, 1, 10, 0),
            includes_break=False,
        ),
    )
    await create_template(
        db_session,
        user.id,
        TemplateCreate(
            text="Delete template",
            label_id=label.id,
            start_time=time(8, 0),
            stop_time=time(9, 0),
        ),
    )
    await create_or_update_work_location(
        db_session,
        user.id,
        WorkLocationCreate(
            date=date(2026, 3, 2),
            country_code="NL",
            label="Home",
        ),
    )
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
    await upsert_user_preferences(
        db_session,
        user.id,
        UserPreferencesWrite(
            data={"theme": "dark"},
            client_updated_at=datetime(2026, 3, 1, 12, 0, tzinfo=UTC),
        ),
    )
    await create_or_update_time_off_entry(
        db_session,
        user.id,
        TimeOffEntryCreate(
            date=date(2026, 3, 3),
            entry_type="vacation",
        ),
    )

    user_scoped_models = (
        TimeTrackingTask,
        TimeTrackingTemplate,
        Label,
        WorkLocation,
        GanttTask,
        UserPreferences,
        TimeOffEntry,
    )

    for model in user_scoped_models:
        count = await db_session.scalar(select(func.count()).select_from(model).where(model.user_id == user.id))
        assert count == 1

    await delete_user(db_session, user.id)

    for model in user_scoped_models:
        count = await db_session.scalar(select(func.count()).select_from(model).where(model.user_id == user.id))
        assert count == 0


async def test_gantt_task_create_rejects_invalid_date_range(db_session: AsyncSession) -> None:
    user = await create_user(
        db_session,
        UserCreate(
            username="gantt-invalid-create",
            display_name="Gantt Invalid Create",
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
    owner = await create_user(db_session, UserCreate(username="owner", display_name="Owner"))
    other = await create_user(db_session, UserCreate(username="other", display_name="Other"))
    label = await create_label(db_session, owner.id, LabelCreate(name="Private", color="#123456"))

    fetched = await get_label(db_session, owner.id, label.id)
    assert fetched.id == label.id

    with pytest.raises(NotFoundError):
        await get_label(db_session, other.id, label.id)


async def test_get_task_is_scoped_to_user(db_session: AsyncSession) -> None:
    owner = await create_user(db_session, UserCreate(username="task_owner", display_name="Task Owner"))
    other = await create_user(db_session, UserCreate(username="task_other", display_name="Task Other"))

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
    owner = await create_user(db_session, UserCreate(username="tpl_owner", display_name="Tpl Owner"))
    other = await create_user(db_session, UserCreate(username="tpl_other", display_name="Tpl Other"))

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


async def test_soft_deleted_entities_are_tombstoned_and_hidden(db_session: AsyncSession) -> None:
    user = await create_user(db_session, UserCreate(username="soft-delete", display_name="Soft Delete"))
    label = await create_label(db_session, user.id, LabelCreate(name="Unused", color="#123456"))
    task = await create_task(
        db_session,
        user.id,
        TaskCreate(
            text="Completed",
            start_time=datetime(2026, 6, 1, 9, 0),
            stop_time=datetime(2026, 6, 1, 10, 0),
            includes_break=False,
        ),
    )
    template = await create_template(
        db_session,
        user.id,
        TemplateCreate(text="Template", start_time=time(9, 0), stop_time=time(10, 0)),
    )
    location = await create_or_update_work_location(
        db_session,
        user.id,
        WorkLocationCreate(date=date(2026, 6, 1), country_code="NL", label="Home"),
    )
    gantt_task = await create_gantt_task(
        db_session,
        user.id,
        GanttTaskCreate(
            name="Milestone",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
            progress=0,
        ),
    )

    await delete_label(db_session, user.id, label.id)
    await delete_task(db_session, user.id, task.id)
    await delete_template(db_session, user.id, template.id)
    await delete_work_location(db_session, user.id, location.date)
    await delete_gantt_task(db_session, user.id, gantt_task.id)

    for model, entity_id in (
        (Label, label.id),
        (TimeTrackingTask, task.id),
        (TimeTrackingTemplate, template.id),
        (WorkLocation, location.id),
        (GanttTask, gantt_task.id),
    ):
        tombstone = await db_session.get(model, entity_id)
        assert tombstone is not None
        assert tombstone.deleted_at is not None

    with pytest.raises(NotFoundError):
        await get_label(db_session, user.id, label.id)
    with pytest.raises(NotFoundError):
        await get_task(db_session, user.id, task.id)
    with pytest.raises(NotFoundError):
        await get_template(db_session, user.id, template.id)
    with pytest.raises(NotFoundError):
        await get_work_location(db_session, user.id, location.date)
    with pytest.raises(NotFoundError):
        await get_gantt_task(db_session, user.id, gantt_task.id)

    assert await get_running_task(db_session, user.id) is None
    assert await list_labels_for_user(db_session, user.id) == []
    assert await list_tasks(db_session, user_id=user.id) == []
    assert await list_templates_for_user(db_session, user.id) == []
    assert await list_work_locations(db_session, user_id=user.id) == []
    assert await list_gantt_tasks(db_session, user_id=user.id) == []

    restored = await create_or_update_work_location(
        db_session,
        user.id,
        WorkLocationCreate(date=location.date, country_code="BE", label="Office"),
    )
    assert restored.id == location.id
    assert restored.deleted_at is None
    assert restored.country_code == "BE"
    assert [item.id for item in await list_work_locations(db_session, user_id=user.id)] == [location.id]
