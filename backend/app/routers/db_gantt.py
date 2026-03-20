"""REST API endpoints for database-backed personal Gantt tasks."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.auth import get_authenticated_user_id, require_user_match
from app.database.engine import get_session
from app.schemas import (
    GanttTaskCreate,
    GanttTaskListResponse,
    GanttTaskRead,
    GanttTaskUpdate,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    ValidationError,
    create_gantt_task,
    delete_gantt_task,
    get_gantt_task,
    list_gantt_tasks,
    update_gantt_task,
)
from app.utils.timing import time_operation

router = APIRouter(prefix="/v1/db/gantt-tasks", tags=["Database Gantt"])


def _handle_error(error: Exception) -> None:
    if isinstance(error, NotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if isinstance(error, ConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if isinstance(error, ValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    raise error


@router.post("", response_model=GanttTaskRead, status_code=status.HTTP_201_CREATED)
async def create_gantt_task_endpoint(
    payload: GanttTaskCreate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> GanttTaskRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        task = await create_gantt_task(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return GanttTaskRead.model_validate(task, from_attributes=True)


@router.get("", response_model=GanttTaskListResponse)
async def list_gantt_tasks_endpoint(
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        tasks = await list_gantt_tasks(session, user_id=user_id)

    response = GanttTaskListResponse(
        items=[GanttTaskRead.model_validate(item, from_attributes=True) for item in tasks],
        total=len(tasks),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/{task_id}", response_model=GanttTaskRead)
async def get_gantt_task_endpoint(
    task_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> GanttTaskRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        task = await get_gantt_task(session, user_id, task_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return GanttTaskRead.model_validate(task, from_attributes=True)


@router.put("/{task_id}", response_model=GanttTaskRead)
async def update_gantt_task_endpoint(
    task_id: str,
    payload: GanttTaskUpdate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> GanttTaskRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        task = await update_gantt_task(session, user_id, task_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return GanttTaskRead.model_validate(task, from_attributes=True)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gantt_task_endpoint(
    task_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    require_user_match(user_id, authenticated_user_id)
    try:
        await delete_gantt_task(session, user_id, task_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
