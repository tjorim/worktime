"""REST API endpoints for database-backed work location resources."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import get_authenticated_user_id, resolve_scoped_user_id
from app.schemas import (
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
from app.utils.pagination import MAX_PAGE_LIMIT, paginate
from app.utils.timing import time_operation

router = APIRouter(prefix="/work-locations", tags=["Work Locations"])


@router.post("/", response_model=WorkLocationRead, status_code=status.HTTP_201_CREATED)
async def create_or_update_work_location_endpoint(
    payload: WorkLocationCreate,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> WorkLocationRead:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)

    try:
        location = await create_or_update_work_location(session, user_id, payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return WorkLocationRead.model_validate(location, from_attributes=True)


@router.get("/", response_model=WorkLocationListResponse)
async def list_work_locations_endpoint(
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        locations = await list_work_locations(
            session,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
        )

    page, total = paginate(locations, limit=limit, offset=offset)
    response = WorkLocationListResponse(
        items=[WorkLocationRead.model_validate(item, from_attributes=True) for item in page],
        total=total,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/{value_date}", response_model=WorkLocationRead)
async def get_work_location_endpoint(
    value_date: date,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    timings: dict[str, float] = {}
    try:
        with time_operation("query", timings):
            location = await get_work_location(session, user_id, value_date)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    response = WorkLocationRead.model_validate(location, from_attributes=True)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.delete("/{value_date}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_work_location_endpoint(
    value_date: date,
    user_id: int | None = Query(default=None, ge=1),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    user_id = resolve_scoped_user_id(user_id, authenticated_user_id)
    try:
        await delete_work_location(session, user_id, value_date)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
