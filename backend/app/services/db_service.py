"""Database service layer for CRUD operations on persistent entities."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import delete, or_, select, update
from sqlalchemy import func as sql_func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Base,
    GanttTask,
    TimeOffEntry,
    TimeTrackingLabel,
    TimeTrackingTask,
    TimeTrackingTemplate,
    User,
    UserPreferences,
    WorkLocation,
)
from app.schemas import (
    GanttTaskCreate,
    GanttTaskUpdate,
    LabelCreate,
    LabelUpdate,
    TaskCreate,
    TaskUpdate,
    TemplateCreate,
    TemplateUpdate,
    TimeOffEntryCreate,
    TimeOffEntryUpdate,
    UserCreate,
    UserPreferencesWrite,
    UserUpdate,
    WorkLocationCreate,
    WorkLocationUpdate,
)
from app.utils.datetime import as_utc


class NotFoundError(Exception):
    """Raised when requested entity cannot be found."""


class ConflictError(Exception):
    """Raised when operation violates a uniqueness/business constraint."""


class ValidationError(Exception):
    """Raised when foreign key or business validation fails."""


MAX_USER_LIST_LIMIT = 1000


def _get_non_nullable_model_fields(model: type[Base]) -> set[str]:
    return {
        column.name
        for column in model.__table__.columns
        if not column.nullable and not column.primary_key
    }


# User operations

async def create_user(
    session: AsyncSession, payload: UserCreate, *, supertokens_user_id: str
) -> User:
    existing = await get_user_by_username(session, payload.username)
    if existing is not None:
        raise ConflictError("username already exists")

    data = payload.model_dump()
    data.pop("password")
    data["supertokens_user_id"] = supertokens_user_id
    user = User(**data)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_user(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("user not found")
    return user


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def list_users(
    session: AsyncSession,
    *,
    offset: int = 0,
    limit: int = 100,
) -> tuple[list[User], int]:
    if offset < 0:
        raise ValidationError(f"offset must be >= 0, got: {offset}")
    if limit < 1:
        raise ValidationError(f"limit must be >= 1, got: {limit}")
    if limit > MAX_USER_LIST_LIMIT:
        raise ValidationError(f"limit must be <= {MAX_USER_LIST_LIMIT}, got: {limit}")

    total_result = await session.execute(select(sql_func.count()).select_from(User))
    total = int(total_result.scalar_one())
    users_result = await session.execute(
        select(User).order_by(User.id).offset(offset).limit(limit)
    )
    users = list(users_result.scalars().all())
    return users, total


async def update_user(session: AsyncSession, user_id: int, payload: UserUpdate) -> User:
    user = await get_user(session, user_id)
    data = payload.model_dump(exclude_unset=True)
    non_nullable_fields = _get_non_nullable_model_fields(User)
    for field, value in data.items():
        if field in non_nullable_fields and value is None:
            raise ValidationError(f"{field} cannot be None")

    username = data.get("username")
    if username is not None and username != user.username:
        existing = await get_user_by_username(session, username)
        if existing is not None and existing.id != user_id:
            raise ConflictError("username already exists")

    for field, value in data.items():
        setattr(user, field, value)
    user.updated_at = datetime.now(UTC)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def delete_user(session: AsyncSession, user_id: int) -> None:
    user = await get_user(session, user_id)

    await session.execute(delete(TimeTrackingTask).where(TimeTrackingTask.user_id == user_id))
    await session.execute(delete(TimeTrackingTemplate).where(TimeTrackingTemplate.user_id == user_id))
    await session.execute(delete(TimeTrackingLabel).where(TimeTrackingLabel.user_id == user_id))
    await session.execute(delete(WorkLocation).where(WorkLocation.user_id == user_id))

    await session.delete(user)
    await session.commit()


# Label operations

async def _ensure_user_exists(session: AsyncSession, user_id: int) -> User:
    return await get_user(session, user_id)


async def _ensure_label_for_user(session: AsyncSession, user_id: int, label_id: str) -> TimeTrackingLabel:
    label = await session.get(TimeTrackingLabel, label_id)
    if label is None or label.user_id != user_id:
        raise NotFoundError("label not found")
    return label


async def create_label(session: AsyncSession, user_id: int, payload: LabelCreate) -> TimeTrackingLabel:
    await _ensure_user_exists(session, user_id)
    result = await session.execute(
        select(TimeTrackingLabel).where(
            TimeTrackingLabel.user_id == user_id,
            TimeTrackingLabel.name == payload.name,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise ConflictError("label name must be unique per user")

    label = TimeTrackingLabel(user_id=user_id, **payload.model_dump())
    session.add(label)
    await session.commit()
    await session.refresh(label)
    return label


async def get_label(session: AsyncSession, user_id: int, label_id: str) -> TimeTrackingLabel:
    """Get a label scoped to a specific user to prevent cross-user access."""
    return await _ensure_label_for_user(session, user_id, label_id)


async def list_labels_for_user(session: AsyncSession, user_id: int) -> list[TimeTrackingLabel]:
    result = await session.execute(
        select(TimeTrackingLabel)
        .where(TimeTrackingLabel.user_id == user_id)
        .order_by(TimeTrackingLabel.created_at.desc())
    )
    return list(result.scalars().all())


async def update_label(
    session: AsyncSession, user_id: int, label_id: str, payload: LabelUpdate
) -> TimeTrackingLabel:
    label = await _ensure_label_for_user(session, user_id, label_id)

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        dup_result = await session.execute(
            select(TimeTrackingLabel).where(
                TimeTrackingLabel.user_id == user_id,
                TimeTrackingLabel.name == data["name"],
                TimeTrackingLabel.id != label_id,
            )
        )
        if dup_result.scalar_one_or_none() is not None:
            raise ConflictError("label name must be unique per user")

    for field, value in data.items():
        setattr(label, field, value)
    session.add(label)
    await session.commit()
    await session.refresh(label)
    return label


async def delete_label(session: AsyncSession, user_id: int, label_id: str) -> None:
    label = await _ensure_label_for_user(session, user_id, label_id)

    await session.execute(
        update(TimeTrackingTask)
        .where(TimeTrackingTask.label_id == label_id)
        .values(label_id=None)
    )
    await session.execute(
        update(TimeTrackingTemplate)
        .where(TimeTrackingTemplate.label_id == label_id)
        .values(label_id=None)
    )
    await session.delete(label)
    await session.commit()


# Task operations

async def _validate_task_label_reference(
    session: AsyncSession, user_id: int, label_id: str | None
) -> None:
    if label_id is None:
        return
    await _ensure_label_for_user(session, user_id, label_id)


async def create_task(session: AsyncSession, user_id: int, payload: TaskCreate) -> TimeTrackingTask:
    await _ensure_user_exists(session, user_id)
    await _validate_task_label_reference(session, user_id, payload.label_id)

    if payload.stop_time is None and await get_running_task(session, user_id) is not None:
        raise ConflictError("only one running task is allowed per user")
    if payload.stop_time is not None and payload.stop_time < payload.start_time:
        raise ValidationError("stop_time cannot be earlier than start_time")

    task = TimeTrackingTask(user_id=user_id, **payload.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def get_task(session: AsyncSession, user_id: int, task_id: str) -> TimeTrackingTask:
    """Get a task scoped to a specific user to prevent cross-user access."""
    task = await session.get(TimeTrackingTask, task_id)
    if task is None or task.user_id != user_id:
        raise NotFoundError("task not found")
    return task


async def list_tasks(
    session: AsyncSession,
    *,
    user_id: int,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    label_id: str | None = None,
) -> list[TimeTrackingTask]:
    statement = select(TimeTrackingTask).where(TimeTrackingTask.user_id == user_id)
    if start_date is not None:
        statement = statement.where(TimeTrackingTask.start_time >= start_date)
    if end_date is not None:
        statement = statement.where(TimeTrackingTask.start_time <= end_date)
    if label_id is not None:
        statement = statement.where(TimeTrackingTask.label_id == label_id)

    result = await session.execute(statement.order_by(TimeTrackingTask.start_time.desc()))
    return list(result.scalars().all())


async def get_running_task(session: AsyncSession, user_id: int) -> TimeTrackingTask | None:
    result = await session.execute(
        select(TimeTrackingTask).where(
            TimeTrackingTask.user_id == user_id,
            TimeTrackingTask.stop_time.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def update_task(
    session: AsyncSession, user_id: int, task_id: str, payload: TaskUpdate
) -> TimeTrackingTask:
    task = await get_task(session, user_id, task_id)

    data = payload.model_dump(exclude_unset=True)
    if "label_id" in data:
        await _validate_task_label_reference(session, user_id, data["label_id"])

    candidate_start_time = data.get("start_time", task.start_time)
    candidate_stop_time = data.get("stop_time", task.stop_time)
    if candidate_start_time is None:
        raise ValidationError("start_time cannot be None")
    # Normalize to UTC-aware for comparison (PostgreSQL returns aware datetimes;
    # callers may supply naive datetimes treated as UTC).
    if candidate_stop_time is not None and as_utc(candidate_stop_time) < as_utc(candidate_start_time):
        raise ValidationError("stop_time cannot be earlier than start_time")
    if candidate_stop_time is None:
        running = await get_running_task(session, user_id)
        if running is not None and running.id != task_id:
            raise ConflictError("only one running task is allowed per user")

    for field, value in data.items():
        setattr(task, field, value)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def delete_task(session: AsyncSession, user_id: int, task_id: str) -> None:
    task = await get_task(session, user_id, task_id)
    await session.delete(task)
    await session.commit()


# Template operations

async def create_template(
    session: AsyncSession, user_id: int, payload: TemplateCreate
) -> TimeTrackingTemplate:
    await _ensure_user_exists(session, user_id)
    await _validate_task_label_reference(session, user_id, payload.label_id)

    template = TimeTrackingTemplate(user_id=user_id, **payload.model_dump())
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


async def get_template(
    session: AsyncSession, user_id: int, template_id: str
) -> TimeTrackingTemplate:
    """Get a template scoped to a specific user to prevent cross-user access."""
    template = await session.get(TimeTrackingTemplate, template_id)
    if template is None or template.user_id != user_id:
        raise NotFoundError("template not found")
    return template


async def list_templates_for_user(
    session: AsyncSession, user_id: int
) -> list[TimeTrackingTemplate]:
    result = await session.execute(
        select(TimeTrackingTemplate)
        .where(TimeTrackingTemplate.user_id == user_id)
        .order_by(TimeTrackingTemplate.created_at.desc())
    )
    return list(result.scalars().all())


async def update_template(
    session: AsyncSession, user_id: int, template_id: str, payload: TemplateUpdate
) -> TimeTrackingTemplate:
    template = await get_template(session, user_id, template_id)

    data = payload.model_dump(exclude_unset=True)
    if "label_id" in data:
        await _validate_task_label_reference(session, user_id, data["label_id"])

    for field, value in data.items():
        setattr(template, field, value)
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


async def delete_template(session: AsyncSession, user_id: int, template_id: str) -> None:
    template = await get_template(session, user_id, template_id)
    await session.delete(template)
    await session.commit()


# Work location operations


async def create_or_update_work_location(
    session: AsyncSession, user_id: int, payload: WorkLocationCreate
) -> WorkLocation:
    await _ensure_user_exists(session, user_id)

    result = await session.execute(
        select(WorkLocation).where(
            WorkLocation.user_id == user_id, WorkLocation.date == payload.date
        )
    )
    location = result.scalar_one_or_none()

    if location is None:
        location = WorkLocation(user_id=user_id, **payload.model_dump())
    else:
        for field, value in payload.model_dump().items():
            setattr(location, field, value)

    session.add(location)
    await session.commit()
    await session.refresh(location)
    return location


async def get_work_location(
    session: AsyncSession, user_id: int, value_date: date
) -> WorkLocation:
    result = await session.execute(
        select(WorkLocation).where(
            WorkLocation.user_id == user_id, WorkLocation.date == value_date
        )
    )
    location = result.scalar_one_or_none()
    if location is None:
        raise NotFoundError("work location not found")
    return location


async def list_work_locations(
    session: AsyncSession,
    *,
    user_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WorkLocation]:
    statement = select(WorkLocation).where(WorkLocation.user_id == user_id)
    if start_date is not None:
        statement = statement.where(WorkLocation.date >= start_date)
    if end_date is not None:
        statement = statement.where(WorkLocation.date <= end_date)

    result = await session.execute(statement.order_by(WorkLocation.date))
    return list(result.scalars().all())


async def update_work_location(
    session: AsyncSession, user_id: int, value_date: date, payload: WorkLocationUpdate
) -> WorkLocation:
    location = await get_work_location(session, user_id, value_date)
    data = payload.model_dump(exclude_unset=True)
    if "country_code" in data and data["country_code"] is None:
        raise ValidationError("country_code cannot be None")

    for field, value in data.items():
        setattr(location, field, value)
    session.add(location)
    await session.commit()
    await session.refresh(location)
    return location


async def delete_work_location(session: AsyncSession, user_id: int, value_date: date) -> None:
    location = await get_work_location(session, user_id, value_date)
    await session.delete(location)
    await session.commit()


# Gantt task operations


async def create_gantt_task(
    session: AsyncSession, user_id: int, payload: GanttTaskCreate
) -> GanttTask:
    await _ensure_user_exists(session, user_id)
    if payload.end_date < payload.start_date:
        raise ValidationError("end_date cannot be earlier than start_date")

    task = GanttTask(user_id=user_id, **payload.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def get_gantt_task(session: AsyncSession, user_id: int, task_id: str) -> GanttTask:
    task = await session.get(GanttTask, task_id)
    if task is None or task.user_id != user_id or task.deleted_at is not None:
        raise NotFoundError("gantt task not found")
    return task


async def list_gantt_tasks(session: AsyncSession, *, user_id: int) -> list[GanttTask]:
    result = await session.execute(
        select(GanttTask)
        .where(GanttTask.user_id == user_id, GanttTask.deleted_at.is_(None))
        .order_by(GanttTask.start_date)
    )
    return list(result.scalars().all())


async def update_gantt_task(
    session: AsyncSession, user_id: int, task_id: str, payload: GanttTaskUpdate
) -> GanttTask:
    task = await get_gantt_task(session, user_id, task_id)

    data = payload.model_dump(exclude_unset=True)
    candidate_start = data.get("start_date", task.start_date)
    candidate_end = data.get("end_date", task.end_date)
    if candidate_end < candidate_start:
        raise ValidationError("end_date cannot be earlier than start_date")

    for field, value in data.items():
        setattr(task, field, value)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def delete_gantt_task(session: AsyncSession, user_id: int, task_id: str) -> None:
    task = await get_gantt_task(session, user_id, task_id)
    await session.delete(task)
    await session.commit()


# User preferences operations


async def get_user_preferences(session: AsyncSession, user_id: int) -> UserPreferences | None:
    """Return the user's preferences row, or None if not yet set."""
    return await session.get(UserPreferences, user_id)


async def upsert_user_preferences(
    session: AsyncSession, user_id: int, payload: UserPreferencesWrite
) -> UserPreferences:
    """Create or update the user's preferences row.

    Last-write-wins: if a row already exists, the payload is accepted only when
    ``payload.client_updated_at`` is strictly newer than the stored
    ``client_updated_at``. Returns the current stored row (possibly unchanged).
    """
    candidate_client_updated_at = as_utc(payload.client_updated_at)
    now = datetime.now(UTC)

    statement = pg_insert(UserPreferences).values(
        user_id=user_id,
        data=payload.data,
        client_updated_at=candidate_client_updated_at,
        updated_at=now,
    )
    statement = statement.on_conflict_do_update(
        index_elements=["user_id"],
        set_={
            "data": statement.excluded.data,
            "client_updated_at": statement.excluded.client_updated_at,
            "updated_at": statement.excluded.updated_at,
        },
        where=statement.excluded.client_updated_at > UserPreferences.client_updated_at,
    ).returning(UserPreferences)

    result = await session.execute(statement)
    prefs = result.scalar_one_or_none()
    if prefs is None:
        prefs = await session.get(UserPreferences, user_id)
        if prefs is None:
            raise RuntimeError("user preferences upsert failed to return or load a row")

    await session.commit()
    return prefs


# Time-off entry operations


def apply_time_off_shape(
    entry: TimeOffEntry,
    *,
    kind: str,
    value_date: date | None,
    start_date: date | None,
    end_date: date | None,
    weekday: int | None,
) -> None:
    entry.entry_kind = kind
    entry.date = value_date if kind == "date" else None
    entry.start_date = start_date if kind == "range" else None
    entry.end_date = end_date if kind == "range" else None
    entry.weekday = weekday if kind == "weekly" else None


async def get_time_off_entry(session: AsyncSession, user_id: int, entry_id: str) -> TimeOffEntry:
    result = await session.execute(
        select(TimeOffEntry).where(
            TimeOffEntry.user_id == user_id,
            TimeOffEntry.entry_id == entry_id,
            TimeOffEntry.deleted_at.is_(None),
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise NotFoundError("time off entry not found")
    return entry


async def list_time_off_entries(
    session: AsyncSession,
    *,
    user_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[TimeOffEntry]:
    statement = select(TimeOffEntry).where(
        TimeOffEntry.user_id == user_id,
        TimeOffEntry.deleted_at.is_(None),
    )
    if start_date is not None:
        # Weekly entries (all date fields NULL) are always included — they recur every week.
        # For date entries: COALESCE(date, end_date) = date → include if date >= start_date.
        # For range entries: COALESCE(date, end_date) = end_date → include if the range ends
        # on or after the filter start (catches ranges that started before the window).
        statement = statement.where(
            or_(
                TimeOffEntry.entry_kind == "weekly",
                sql_func.coalesce(TimeOffEntry.date, TimeOffEntry.end_date) >= start_date,
            )
        )
    if end_date is not None:
        # For date entries: COALESCE(date, start_date) = date → include if date <= end_date.
        # For range entries: COALESCE(date, start_date) = start_date → include if the range
        # starts on or before the filter end (catches ranges that end after the window).
        statement = statement.where(
            or_(
                TimeOffEntry.entry_kind == "weekly",
                sql_func.coalesce(TimeOffEntry.date, TimeOffEntry.start_date) <= end_date,
            )
        )

    result = await session.execute(
        statement.order_by(
            sql_func.coalesce(TimeOffEntry.date, TimeOffEntry.start_date).nulls_last(),
            TimeOffEntry.weekday,
            TimeOffEntry.entry_id,
        )
    )
    return list(result.scalars().all())


async def create_or_update_time_off_entry(
    session: AsyncSession, user_id: int, payload: TimeOffEntryCreate
) -> tuple[TimeOffEntry, bool]:
    """Upsert a time-off entry for (user_id, entry_id).

    The unique index on (user_id, entry_id) has no partial filter, so a
    soft-deleted row with the same entry_id blocks re-insertion of a fresh row.
    This function always *restores* an existing row (including soft-deleted ones)
    rather than inserting a new one, which keeps the constraint satisfied and
    ensures deletion history is preserved.

    Returns ``(entry, created)`` where ``created`` is True only when a brand-new
    row was inserted (i.e. no prior row — active or soft-deleted — existed for
    this entry_id).
    """
    entry_id = payload.entry_id or str(uuid4())
    result = await session.execute(
        select(TimeOffEntry).where(
            TimeOffEntry.user_id == user_id,
            TimeOffEntry.entry_id == entry_id,
        )
    )
    entry = result.scalar_one_or_none()

    created = entry is None

    if created:
        new_entry = TimeOffEntry(
            entry_id=entry_id,
            user_id=user_id,
            entry_type=payload.entry_type,
            entry_flag=payload.entry_flag,
            note=payload.note,
        )
        apply_time_off_shape(
            new_entry,
            kind=payload.entry_kind,
            value_date=payload.date,
            start_date=payload.start_date,
            end_date=payload.end_date,
            weekday=payload.weekday,
        )
        entry = new_entry
    else:
        apply_time_off_shape(
            entry,
            kind=payload.entry_kind,
            value_date=payload.date,
            start_date=payload.start_date,
            end_date=payload.end_date,
            weekday=payload.weekday,
        )
        entry.entry_type = payload.entry_type
        entry.entry_flag = payload.entry_flag
        entry.note = payload.note
        entry.deleted_at = None
        entry.updated_at = datetime.now(UTC)

    session.add(entry)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        result = await session.execute(
            select(TimeOffEntry).where(
                TimeOffEntry.user_id == user_id,
                TimeOffEntry.entry_id == entry_id,
            )
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            raise
        # A concurrent request won the INSERT race; apply our payload to that row.
        apply_time_off_shape(
            entry,
            kind=payload.entry_kind,
            value_date=payload.date,
            start_date=payload.start_date,
            end_date=payload.end_date,
            weekday=payload.weekday,
        )
        entry.entry_type = payload.entry_type
        entry.entry_flag = payload.entry_flag
        entry.note = payload.note
        entry.deleted_at = None
        entry.updated_at = datetime.now(UTC)
        session.add(entry)
        await session.commit()
        created = False
    await session.refresh(entry)
    return entry, created


async def update_time_off_entry(
    session: AsyncSession, user_id: int, entry_id: str, payload: TimeOffEntryUpdate
) -> TimeOffEntry:
    entry = await get_time_off_entry(session, user_id, entry_id)
    data = payload.model_dump(exclude_unset=True)
    non_nullable_fields = _get_non_nullable_model_fields(TimeOffEntry)
    for field, value in data.items():
        if field in non_nullable_fields and value is None:
            raise ValidationError(f"{field} cannot be None")
    if "entry_kind" in data:
        apply_time_off_shape(
            entry,
            kind=data["entry_kind"],
            value_date=data.get("date"),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            weekday=data.get("weekday"),
        )
        data = {
            field: value
            for field, value in data.items()
            if field not in {"entry_kind", "date", "start_date", "end_date", "weekday"}
        }
    for field, value in data.items():
        setattr(entry, field, value)
    entry.updated_at = datetime.now(UTC)
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def delete_time_off_entry(session: AsyncSession, user_id: int, entry_id: str) -> None:
    """Soft-delete a time-off entry so deletions sync to other devices."""
    entry = await get_time_off_entry(session, user_id, entry_id)
    now = datetime.now(UTC)
    entry.deleted_at = now
    entry.updated_at = now
    session.add(entry)
    await session.commit()
