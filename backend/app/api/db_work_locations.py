"""REST API endpoints for database-backed work location resources."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.api.auth import get_authenticated_user_id, require_user_match
from app.database.engine import get_session
from app.models.db_schemas import (
    WorkLocationCreate,
    WorkLocationListResponse,
    WorkLocationRead,
)
from app.services.db_service import (
    NotFoundError,
    ValidationError,
    create_or_update_work_location,
    delete_work_location,
    get_work_location,
    list_work_locations,
)
from app.utils.timing import time_operation

router = APIRouter(prefix="/v1/db/work-locations", tags=["Database Work Locations"])


@router.post("/", response_model=WorkLocationRead, status_code=status.HTTP_201_CREATED)
def create_or_update_work_location_endpoint(
    payload: WorkLocationCreate,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> WorkLocationRead:
    require_user_match(user_id, authenticated_user_id)

    try:
        location = create_or_update_work_location(session, user_id, payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return WorkLocationRead.model_validate(location, from_attributes=True)


@router.get("/", response_model=WorkLocationListResponse)
def list_work_locations_endpoint(
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    start_date: date | None = None,
    end_date: date | None = None,
    session: Session = Depends(get_session),
) -> JSONResponse:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        locations = list_work_locations(
            session,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
        )

    response = WorkLocationListResponse(
        items=[WorkLocationRead.model_validate(item, from_attributes=True) for item in locations],
        total=len(locations),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/{value_date}", response_model=WorkLocationRead)
def get_work_location_endpoint(
    value_date: date,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> JSONResponse:
    require_user_match(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    try:
        with time_operation("query", timings):
            location = get_work_location(session, user_id, value_date)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    response = WorkLocationRead.model_validate(location, from_attributes=True)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.delete("/{value_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_location_endpoint(
    value_date: date,
    user_id: int = Query(..., ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: Session = Depends(get_session),
) -> Response:
    require_user_match(user_id, authenticated_user_id)
    try:
        delete_work_location(session, user_id, value_date)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
