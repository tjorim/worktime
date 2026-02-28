"""REST API endpoints for database-backed time tracking resources."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.api.auth import get_authenticated_user_id, require_user_match
from app.database.engine import get_session
from app.models.db_schemas import (
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
from app.utils.timing import time_operation

router = APIRouter(prefix="/v1/db/time-tracking", tags=["Database Time Tracking"])


def _handle_error(error: Exception) -> None:
    if isinstance(error, NotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if isinstance(error, ConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if isinstance(error, ValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    raise error


@router.post("/labels", response_model=LabelRead, status_code=status.HTTP_201_CREATED)
def create_label_endpoint(
    payload: LabelCreate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> LabelRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        label = create_label(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return LabelRead.model_validate(label, from_attributes=True)


@router.get("/labels", response_model=LabelListResponse)
def list_labels_endpoint(
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> JSONResponse:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        labels = list_labels_for_user(session, user_id)

    response = LabelListResponse(
        items=[LabelRead.model_validate(item, from_attributes=True) for item in labels],
        total=len(labels),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/labels/{label_id}", response_model=LabelRead)
def get_label_endpoint(
    label_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> LabelRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        label = get_label(session, user_id, label_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return LabelRead.model_validate(label, from_attributes=True)


@router.put("/labels/{label_id}", response_model=LabelRead)
def update_label_endpoint(
    label_id: str,
    payload: LabelUpdate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> LabelRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        label = update_label(session, user_id, label_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return LabelRead.model_validate(label, from_attributes=True)


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label_endpoint(
    label_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> Response:
    require_user_match(user_id, authenticated_user_id)
    try:
        delete_label(session, user_id, label_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task_endpoint(
    payload: TaskCreate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> TaskRead:
    require_user_match(user_id, authenticated_user_id)

    try:
        task = create_task(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return TaskRead.model_validate(task, from_attributes=True)


@router.get("/tasks", response_model=TaskListResponse)
def list_tasks_endpoint(
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    label_id: str | None = None,
    session: Session = Depends(get_session),
) -> JSONResponse:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        tasks = list_tasks(
            session,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            label_id=label_id,
        )

    response = TaskListResponse(
        items=[TaskRead.model_validate(item, from_attributes=True) for item in tasks],
        total=len(tasks),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/tasks/running", response_model=TaskRead | None)
def get_running_task_endpoint(
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> Response:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        task = get_running_task(session, user_id)

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
def get_task_endpoint(
    task_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> TaskRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        task = get_task(session, user_id, task_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return TaskRead.model_validate(task, from_attributes=True)


@router.put("/tasks/{task_id}", response_model=TaskRead)
def update_task_endpoint(
    task_id: str,
    payload: TaskUpdate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> TaskRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        task = update_task(session, user_id, task_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return TaskRead.model_validate(task, from_attributes=True)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_endpoint(
    task_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> Response:
    require_user_match(user_id, authenticated_user_id)
    try:
        delete_task(session, user_id, task_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/templates", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template_endpoint(
    payload: TemplateCreate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> TemplateRead:
    require_user_match(user_id, authenticated_user_id)

    try:
        template = create_template(session, user_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return TemplateRead.model_validate(template, from_attributes=True)


@router.get("/templates", response_model=TemplateListResponse)
def list_templates_endpoint(
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> JSONResponse:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        templates = list_templates_for_user(session, user_id)

    response = TemplateListResponse(
        items=[TemplateRead.model_validate(item, from_attributes=True) for item in templates],
        total=len(templates),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/templates/{template_id}", response_model=TemplateRead)
def get_template_endpoint(
    template_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> TemplateRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        template = get_template(session, user_id, template_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return TemplateRead.model_validate(template, from_attributes=True)


@router.put("/templates/{template_id}", response_model=TemplateRead)
def update_template_endpoint(
    template_id: str,
    payload: TemplateUpdate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> TemplateRead:
    require_user_match(user_id, authenticated_user_id)
    try:
        template = update_template(session, user_id, template_id, payload)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)
        raise  # _handle_error always raises; this satisfies type checkers

    return TemplateRead.model_validate(template, from_attributes=True)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template_endpoint(
    template_id: str,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> Response:
    require_user_match(user_id, authenticated_user_id)
    try:
        delete_template(session, user_id, template_id)
    except (NotFoundError, ConflictError, ValidationError) as error:
        _handle_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
