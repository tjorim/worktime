"""REST API endpoints for database-backed time tracking resources."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import get_authenticated_user_id, resolve_scoped_user_id
from app.schemas import (
    LabelCreate,
    LabelListResponse,
    LabelRead,
    LabelUpdate,
    TaskCreate,
    TaskListResponse,
    TaskRead,
    TaskUpdate,
    TemplateCreate,
    TemplateListResponse,
    TemplateRead,
    TemplateUpdate,
)
from app.services.db_service import (
    ConflictError,
    NotFoundError,
    ValidationError,
    create_label,
    create_task,
    create_template,
    delete_label,
    delete_task,
    delete_template,
    get_label,
    get_running_task,
    get_task,
    get_template,
    list_labels_for_user,
    list_tasks,
    list_templates_for_user,
    update_label,
    update_task,
    update_template,
)
from app.utils.pagination import MAX_PAGE_LIMIT, paginate
from app.utils.timing import time_operation

router = APIRouter(prefix="/time-tracking", tags=["Time Tracking"])


def _handle_error(error: Exception) -> None:
    if isinstance(error, NotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if isinstance(error, ConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if isinstance(error, ValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    raise error


@router.post("/labels", response_model=LabelRead, status_code=status.HTTP_201_CREATED)
async def create_label_endpoint(
    payload: LabelCreate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> LabelRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        label = await create_label(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return LabelRead.model_validate(label, from_attributes=True)


@router.get("/labels", response_model=LabelListResponse)
async def list_labels_endpoint(
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        labels = await list_labels_for_user(session, user_id)

    page, total = paginate(labels, limit=limit, offset=offset)
    response = LabelListResponse(
        items=[LabelRead.model_validate(item, from_attributes=True) for item in page],
        total=total,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/labels/{label_id}", response_model=LabelRead)
async def get_label_endpoint(
    label_id: str,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> LabelRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        label = await get_label(session, user_id, label_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return LabelRead.model_validate(label, from_attributes=True)


@router.put("/labels/{label_id}", response_model=LabelRead)
async def update_label_endpoint(
    label_id: str,
    payload: LabelUpdate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> LabelRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        label = await update_label(session, user_id, label_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return LabelRead.model_validate(label, from_attributes=True)


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label_endpoint(
    label_id: str,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        await delete_label(session, user_id, label_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task_endpoint(
    payload: TaskCreate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)

    try:
        task = await create_task(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return TaskRead.model_validate(task, from_attributes=True)


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks_endpoint(
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    label_id: str | None = None,
    gantt_task_id: str | None = None,
    limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        tasks = await list_tasks(
            session,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            label_id=label_id,
            gantt_task_id=gantt_task_id,
        )

    page, total = paginate(tasks, limit=limit, offset=offset)
    response = TaskListResponse(
        items=[TaskRead.model_validate(item, from_attributes=True) for item in page],
        total=total,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/tasks/running", response_model=TaskRead | None)
async def get_running_task_endpoint(
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        task = await get_running_task(session, user_id)

    headers = {"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"}
    if task is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers=headers)

    response_payload = TaskRead.model_validate(task, from_attributes=True)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response_payload.model_dump(mode="json"),
        headers=headers,
    )


@router.get("/tasks/{task_id}", response_model=TaskRead)
async def get_task_endpoint(
    task_id: str,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        task = await get_task(session, user_id, task_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return TaskRead.model_validate(task, from_attributes=True)


@router.put("/tasks/{task_id}", response_model=TaskRead)
async def update_task_endpoint(
    task_id: str,
    payload: TaskUpdate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        task = await update_task(session, user_id, task_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return TaskRead.model_validate(task, from_attributes=True)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_endpoint(
    task_id: str,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        await delete_task(session, user_id, task_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/templates", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template_endpoint(
    payload: TemplateCreate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> TemplateRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)

    try:
        template = await create_template(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return TemplateRead.model_validate(template, from_attributes=True)


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates_endpoint(
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        templates = await list_templates_for_user(session, user_id)

    page, total = paginate(templates, limit=limit, offset=offset)
    response = TemplateListResponse(
        items=[TemplateRead.model_validate(item, from_attributes=True) for item in page],
        total=total,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/templates/{template_id}", response_model=TemplateRead)
async def get_template_endpoint(
    template_id: str,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> TemplateRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        template = await get_template(session, user_id, template_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return TemplateRead.model_validate(template, from_attributes=True)


@router.put("/templates/{template_id}", response_model=TemplateRead)
async def update_template_endpoint(
    template_id: str,
    payload: TemplateUpdate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> TemplateRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        template = await update_template(session, user_id, template_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise

    return TemplateRead.model_validate(template, from_attributes=True)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_endpoint(
    template_id: str,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        await delete_template(session, user_id, template_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
