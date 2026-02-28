"""Database service layer for CRUD operations on persistent entities."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func as sql_func
from sqlmodel import Session, col, delete, select, update

from app.database.models import (
    TimeTrackingLabel,
    TimeTrackingTask,
    TimeTrackingTemplate,
    User,
    WorkLocation,
)
from app.models.db_schemas import (
    LabelCreate,
    LabelUpdate,
    TaskCreate,
    TaskUpdate,
    TemplateCreate,
    TemplateUpdate,
    UserCreate,
    UserUpdate,
    WorkLocationCreate,
    WorkLocationUpdate,
)


class NotFoundError(Exception):
    """Raised when requested entity cannot be found."""


class ConflictError(Exception):
    """Raised when operation violates a uniqueness/business constraint."""


class ValidationError(Exception):
    """Raised when foreign key or business validation fails."""


ADMIN_SCOPE_REQUIRED_MSG = "listing all users requires admin scope"
MAX_USER_LIST_LIMIT = 1000


def _get_non_nullable_model_fields(model: type) -> set[str]:
    return {
        column.name
        for column in model.__table__.columns
        if not column.nullable and not column.primary_key
    }


# User operations

def create_user(session: Session, payload: UserCreate) -> User:
    existing = get_user_by_username(session, payload.username)
    if existing is not None:
        raise ConflictError("username already exists")

    user = User(**payload.model_dump())
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise NotFoundError("user not found")
    return user


def get_user_by_username(session: Session, username: str) -> User | None:
    return session.exec(select(User).where(User.username == username)).first()


def list_users(
    session: Session,
    *,
    is_admin: bool = False,
    offset: int = 0,
    limit: int = 100,
) -> tuple[list[User], int]:
    if not is_admin:
        raise ValidationError(ADMIN_SCOPE_REQUIRED_MSG)
    if offset < 0:
        raise ValidationError(f"offset must be >= 0, got: {offset}")
    if limit < 1:
        raise ValidationError(f"limit must be >= 1, got: {limit}")
    if limit > MAX_USER_LIST_LIMIT:
        raise ValidationError(f"limit must be <= {MAX_USER_LIST_LIMIT}, got: {limit}")

    total = int(session.exec(select(sql_func.count()).select_from(User)).one())
    users = list(
        session.exec(
            select(User)
            .order_by(User.id)
            .offset(offset)
            .limit(limit)
        ).all()
    )
    return users, total


def update_user(session: Session, user_id: int, payload: UserUpdate) -> User:
    user = get_user(session, user_id)
    data = payload.model_dump(exclude_unset=True)
    non_nullable_fields = _get_non_nullable_model_fields(User)
    for field, value in data.items():
        if field in non_nullable_fields and value is None:
            raise ValidationError(f"{field} cannot be None")

    for field, value in data.items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def delete_user(session: Session, user_id: int) -> None:
    user = get_user(session, user_id)

    session.exec(delete(TimeTrackingTask).where(TimeTrackingTask.user_id == user_id))
    session.exec(delete(TimeTrackingTemplate).where(TimeTrackingTemplate.user_id == user_id))
    session.exec(delete(TimeTrackingLabel).where(TimeTrackingLabel.user_id == user_id))
    session.exec(delete(WorkLocation).where(WorkLocation.user_id == user_id))

    session.delete(user)
    session.commit()


# Label operations

def _ensure_user_exists(session: Session, user_id: int) -> User:
    return get_user(session, user_id)


def _ensure_label_for_user(session: Session, user_id: int, label_id: str) -> TimeTrackingLabel:
    label = session.get(TimeTrackingLabel, label_id)
    if label is None or label.user_id != user_id:
        raise NotFoundError("label not found")
    return label


def create_label(session: Session, user_id: int, payload: LabelCreate) -> TimeTrackingLabel:
    _ensure_user_exists(session, user_id)
    duplicate = session.exec(
        select(TimeTrackingLabel).where(
            TimeTrackingLabel.user_id == user_id,
            TimeTrackingLabel.name == payload.name,
        )
    ).first()
    if duplicate is not None:
        raise ConflictError("label name must be unique per user")

    label = TimeTrackingLabel(user_id=user_id, **payload.model_dump())
    session.add(label)
    session.commit()
    session.refresh(label)
    return label


def get_label(session: Session, user_id: int, label_id: str) -> TimeTrackingLabel:
    """Get a label scoped to a specific user to prevent cross-user access."""
    return _ensure_label_for_user(session, user_id, label_id)


def list_labels_for_user(session: Session, user_id: int) -> list[TimeTrackingLabel]:
    return list(
        session.exec(
            select(TimeTrackingLabel)
            .where(TimeTrackingLabel.user_id == user_id)
            .order_by(TimeTrackingLabel.created_at.desc())
        ).all()
    )


def update_label(session: Session, user_id: int, label_id: str, payload: LabelUpdate) -> TimeTrackingLabel:
    label = _ensure_label_for_user(session, user_id, label_id)

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        duplicate = session.exec(
            select(TimeTrackingLabel).where(
                TimeTrackingLabel.user_id == user_id,
                TimeTrackingLabel.name == data["name"],
                TimeTrackingLabel.id != label_id,
            )
        ).first()
        if duplicate is not None:
            raise ConflictError("label name must be unique per user")

    for field, value in data.items():
        setattr(label, field, value)
    session.add(label)
    session.commit()
    session.refresh(label)
    return label


def delete_label(session: Session, user_id: int, label_id: str) -> None:
    label = _ensure_label_for_user(session, user_id, label_id)

    session.exec(
        update(TimeTrackingTask)
        .where(TimeTrackingTask.label_id == label_id)
        .values(label_id=None)
    )
    session.exec(
        update(TimeTrackingTemplate)
        .where(TimeTrackingTemplate.label_id == label_id)
        .values(label_id=None)
    )
    session.delete(label)
    session.commit()


# Task operations

def _validate_task_label_reference(session: Session, user_id: int, label_id: str | None) -> None:
    if label_id is None:
        return
    _ensure_label_for_user(session, user_id, label_id)


def create_task(session: Session, user_id: int, payload: TaskCreate) -> TimeTrackingTask:
    _ensure_user_exists(session, user_id)
    _validate_task_label_reference(session, user_id, payload.label_id)

    if payload.stop_time is None and get_running_task(session, user_id) is not None:
        raise ConflictError("only one running task is allowed per user")
    if payload.stop_time is not None and payload.stop_time < payload.start_time:
        raise ValidationError("stop_time cannot be earlier than start_time")

    task = TimeTrackingTask(user_id=user_id, **payload.model_dump())
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def get_task(session: Session, user_id: int, task_id: str) -> TimeTrackingTask:
    """Get a task scoped to a specific user to prevent cross-user access."""
    task = session.get(TimeTrackingTask, task_id)
    if task is None or task.user_id != user_id:
        raise NotFoundError("task not found")
    return task


def list_tasks(
    session: Session,
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

    return list(session.exec(statement.order_by(TimeTrackingTask.start_time.desc())).all())


def get_running_task(session: Session, user_id: int) -> TimeTrackingTask | None:
    return session.exec(
        select(TimeTrackingTask).where(
            TimeTrackingTask.user_id == user_id,
            col(TimeTrackingTask.stop_time).is_(None),
        )
    ).first()


def update_task(session: Session, user_id: int, task_id: str, payload: TaskUpdate) -> TimeTrackingTask:
    task = get_task(session, user_id, task_id)

    data = payload.model_dump(exclude_unset=True)
    if "label_id" in data:
        _validate_task_label_reference(session, user_id, data["label_id"])

    candidate_start_time = data.get("start_time", task.start_time)
    candidate_stop_time = data.get("stop_time", task.stop_time)
    if candidate_stop_time is not None and candidate_stop_time < candidate_start_time:
        raise ValidationError("stop_time cannot be earlier than start_time")
    if candidate_stop_time is None:
        running = get_running_task(session, user_id)
        if running is not None and running.id != task_id:
            raise ConflictError("only one running task is allowed per user")

    for field, value in data.items():
        setattr(task, field, value)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def delete_task(session: Session, user_id: int, task_id: str) -> None:
    task = get_task(session, user_id, task_id)
    session.delete(task)
    session.commit()


# Template operations

def create_template(session: Session, user_id: int, payload: TemplateCreate) -> TimeTrackingTemplate:
    _ensure_user_exists(session, user_id)
    _validate_task_label_reference(session, user_id, payload.label_id)

    template = TimeTrackingTemplate(user_id=user_id, **payload.model_dump())
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def get_template(session: Session, user_id: int, template_id: str) -> TimeTrackingTemplate:
    """Get a template scoped to a specific user to prevent cross-user access."""
    template = session.get(TimeTrackingTemplate, template_id)
    if template is None or template.user_id != user_id:
        raise NotFoundError("template not found")
    return template


def list_templates_for_user(session: Session, user_id: int) -> list[TimeTrackingTemplate]:
    return list(
        session.exec(
            select(TimeTrackingTemplate)
            .where(TimeTrackingTemplate.user_id == user_id)
            .order_by(TimeTrackingTemplate.created_at.desc())
        ).all()
    )


def update_template(
    session: Session, user_id: int, template_id: str, payload: TemplateUpdate
) -> TimeTrackingTemplate:
    template = get_template(session, user_id, template_id)

    data = payload.model_dump(exclude_unset=True)
    if "label_id" in data:
        _validate_task_label_reference(session, user_id, data["label_id"])

    for field, value in data.items():
        setattr(template, field, value)
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def delete_template(session: Session, user_id: int, template_id: str) -> None:
    template = get_template(session, user_id, template_id)
    session.delete(template)
    session.commit()


# Work location operations


def create_or_update_work_location(
    session: Session, user_id: int, payload: WorkLocationCreate
) -> WorkLocation:
    _ensure_user_exists(session, user_id)

    location = session.exec(
        select(WorkLocation).where(WorkLocation.user_id == user_id, WorkLocation.date == payload.date)
    ).first()

    if location is None:
        location = WorkLocation(user_id=user_id, **payload.model_dump())
    else:
        for field, value in payload.model_dump().items():
            setattr(location, field, value)

    session.add(location)
    session.commit()
    session.refresh(location)
    return location


def get_work_location(session: Session, user_id: int, value_date: date) -> WorkLocation:
    location = session.exec(
        select(WorkLocation).where(WorkLocation.user_id == user_id, WorkLocation.date == value_date)
    ).first()
    if location is None:
        raise NotFoundError("work location not found")
    return location


def list_work_locations(
    session: Session,
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

    return list(session.exec(statement.order_by(WorkLocation.date)).all())


def update_work_location(
    session: Session, user_id: int, value_date: date, payload: WorkLocationUpdate
) -> WorkLocation:
    location = get_work_location(session, user_id, value_date)
    data = payload.model_dump(exclude_unset=True)
    if "country_code" in data and data["country_code"] is None:
        raise ValidationError("country_code cannot be None")

    for field, value in data.items():
        setattr(location, field, value)
    session.add(location)
    session.commit()
    session.refresh(location)
    return location


def delete_work_location(session: Session, user_id: int, value_date: date) -> None:
    location = get_work_location(session, user_id, value_date)
    session.delete(location)
    session.commit()
