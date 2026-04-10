"""REST API endpoints for database-backed time-off entries (local-first sync)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import get_authenticated_user_id
from app.schemas import (
    TimeOffEntryCreate,
    TimeOffEntryListResponse,
    TimeOffEntryRead,
    TimeOffEntryUpdate,
)
from app.services.db_service import (
    NotFoundError,
    ValidationError,
    create_or_update_time_off_entry,
    delete_time_off_entry,
    get_time_off_entry,
    list_time_off_entries,
    update_time_off_entry,
)
from app.utils.timing import time_operation

router = APIRouter(prefix="/time-off", tags=["Time Off"])


@router.post("/", response_model=TimeOffEntryRead, status_code=status.HTTP_201_CREATED)
async def create_or_update_time_off_endpoint(
    payload: TimeOffEntryCreate,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    entry, created = await create_or_update_time_off_entry(session, authenticated_user_id, payload)
    response = TimeOffEntryRead.model_validate(entry, from_attributes=True)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
    )


@router.get("/", response_model=TimeOffEntryListResponse)
async def list_time_off_entries_endpoint(
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    start_date: date | None = None,
    end_date: date | None = None,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    timings: dict[str, float] = {}
    with time_operation("query", timings):
        entries = await list_time_off_entries(
            session,
            user_id=authenticated_user_id,
            start_date=start_date,
            end_date=end_date,
        )

    response = TimeOffEntryListResponse(
        items=[TimeOffEntryRead.model_validate(e, from_attributes=True) for e in entries],
        total=len(entries),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=response.model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.get("/{entry_id}", response_model=TimeOffEntryRead)
async def get_time_off_entry_endpoint(
    entry_id: str,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    timings: dict[str, float] = {}
    try:
        with time_operation("query", timings):
            entry = await get_time_off_entry(session, authenticated_user_id, entry_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.patch("/{entry_id}", response_model=TimeOffEntryRead)
async def update_time_off_entry_endpoint(
    entry_id: str,
    payload: TimeOffEntryUpdate,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    timings: dict[str, float] = {}
    try:
        with time_operation("query", timings):
            entry = await update_time_off_entry(session, authenticated_user_id, entry_id, payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=TimeOffEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json"),
        headers={"X-Db-Query-Ms": f"{timings.get('query', 0):.3f}"},
    )


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_time_off_entry_endpoint(
    entry_id: str,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        await delete_time_off_entry(session, authenticated_user_id, entry_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)
