"""Narrow read and action surface for the Pebble companion app."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, api_error
from app.database.engine import get_session
from app.database.models import TimeTrackingTask
from app.read_models import CurrentStatusReadModel, NextShiftsReadModel
from app.routers.auth import (
    AuthenticatedPrincipal,
    audit_actor_for,
    require_pebble_read_principal,
    require_pebble_write_principal,
)
from app.schemas import TaskCreate, TaskRead, TaskUpdate
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    ValidationError,
    create_task,
    get_next_planned_task,
    get_running_task,
    update_task,
)
from app.services.read_models_service import build_dashboard_read_model

# Shift hours are local wall-clock times (the iCal feed uses the same zone), so a client
# that does not say otherwise gets them evaluated in the roster's home zone, not UTC.
DEFAULT_SHIFT_TIMEZONE = "Europe/Brussels"

router = APIRouter(prefix="/pebble", tags=["Pebble"])


class PebbleDashboardRead(BaseModel):
    running_task: TaskRead | None
    planned_task: TaskRead | None
    current_status: CurrentStatusReadModel
    next_shifts: NextShiftsReadModel


def _task_read(task: TimeTrackingTask) -> TaskRead:
    return TaskRead.model_validate(task, from_attributes=True)


@router.get("/dashboard", response_model=PebbleDashboardRead)
async def get_pebble_dashboard(
    timezone: str = Query(default=DEFAULT_SHIFT_TIMEZONE),
    principal: AuthenticatedPrincipal = Depends(require_pebble_read_principal),
    session: AsyncSession = Depends(get_session),
) -> PebbleDashboardRead:
    try:
        ZoneInfo(timezone)
    except ZoneInfoNotFoundError, KeyError, ValueError:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.UNKNOWN_TIMEZONE,
            f"Unknown timezone: {timezone!r}",
        ) from None
    try:
        dashboard = await build_dashboard_read_model(
            session,
            principal,
            as_of=None,
            timezone=timezone,
            next_shift_limit=1,
        )
    except NotFoundError as error:
        raise api_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, str(error)) from error
    running_task = await get_running_task(session, principal.user_id)
    planned_task = await get_next_planned_task(session, principal.user_id)
    return PebbleDashboardRead(
        running_task=_task_read(running_task) if running_task is not None else None,
        planned_task=_task_read(planned_task) if planned_task is not None else None,
        current_status=dashboard.current_status,
        next_shifts=dashboard.next_shifts,
    )


@router.post(
    "/actions/clock-in",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
)
async def pebble_clock_in(
    principal: AuthenticatedPrincipal = Depends(require_pebble_write_principal),
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    try:
        task = await create_task(
            session,
            principal.user_id,
            TaskCreate(text="Working", start_time=datetime.now(UTC)),
            actor=audit_actor_for(principal),
        )
    except ConflictError as error:
        raise api_error(status.HTTP_409_CONFLICT, ErrorCode.CONFLICT, str(error)) from error
    return _task_read(task)


@router.post("/actions/clock-out", response_model=TaskRead)
async def pebble_clock_out(
    principal: AuthenticatedPrincipal = Depends(require_pebble_write_principal),
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    running_task = await get_running_task(session, principal.user_id)
    if running_task is None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            ErrorCode.NO_RUNNING_TASK,
            "No running task to clock out",
        )
    try:
        task = await update_task(
            session,
            principal.user_id,
            running_task.id,
            TaskUpdate(stop_time=datetime.now(UTC)),
            actor=audit_actor_for(principal),
        )
    except (NotFoundError, ConflictError, ValidationError) as error:
        raise api_error(status.HTTP_409_CONFLICT, ErrorCode.CONFLICT, str(error)) from error
    return _task_read(task)
