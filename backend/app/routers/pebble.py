"""Narrow read and action surface for the Pebble companion app."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.database.models import TimeTrackingTask
from app.read_models import CurrentStatusReadModel, NextShiftsReadModel
from app.routers.auth import (
    AuthenticatedPrincipal,
    require_pebble_read_principal,
    require_pebble_write_principal,
)
from app.schemas import TaskCreate, TaskRead, TaskUpdate
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    ValidationError,
    create_task,
    get_running_task,
    update_task,
)
from app.services.read_models_service import build_dashboard_read_model

router = APIRouter(prefix="/pebble", tags=["Pebble"])


class PebbleDashboardRead(BaseModel):
    running_task: TaskRead | None
    current_status: CurrentStatusReadModel
    next_shifts: NextShiftsReadModel


def _task_read(task: TimeTrackingTask) -> TaskRead:
    return TaskRead.model_validate(task, from_attributes=True)


@router.get("/dashboard", response_model=PebbleDashboardRead)
async def get_pebble_dashboard(
    principal: AuthenticatedPrincipal = Depends(require_pebble_read_principal),
    session: AsyncSession = Depends(get_session),
) -> PebbleDashboardRead:
    try:
        dashboard = await build_dashboard_read_model(
            session,
            principal,
            as_of=None,
            timezone="UTC",
            next_shift_limit=1,
        )
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    running_task = await get_running_task(session, principal.user_id)
    return PebbleDashboardRead(
        running_task=_task_read(running_task) if running_task is not None else None,
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
        )
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return _task_read(task)


@router.post("/actions/clock-out", response_model=TaskRead)
async def pebble_clock_out(
    principal: AuthenticatedPrincipal = Depends(require_pebble_write_principal),
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    running_task = await get_running_task(session, principal.user_id)
    if running_task is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No running task to clock out",
        )
    try:
        task = await update_task(
            session,
            principal.user_id,
            running_task.id,
            TaskUpdate(stop_time=datetime.now(UTC)),
        )
    except (NotFoundError, ConflictError, ValidationError) as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return _task_read(task)
