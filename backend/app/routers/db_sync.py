"""REST API endpoints for bidirectional SQLite sync."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.routers.auth import get_authenticated_user_id
from app.schemas import (
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    SyncStatusResponse,
)
from app.services.db_service import ValidationError
from app.services.sync_service import get_sync_status, pull_changes, push_changes
from app.utils.timing import time_operation

router = APIRouter(prefix="/v1/db/sync", tags=["Database Sync"])

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


@router.post("/push", response_model=SyncPushResponse, status_code=status.HTTP_200_OK)
async def push_endpoint(
    payload: SyncPushRequest,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Push a batch of local changes to the server.

    All records are processed in a single transaction.  Each record in the
    response carries either ``status='ok'`` (applied) or ``status='conflict'``
    (server version was newer — client should accept server value).  Any
    unexpected error rolls back the entire batch.
    """
    timings: dict[str, float] = {}
    try:
        with time_operation("sync", timings):
            result = await push_changes(session, authenticated_user_id, payload)
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=result.model_dump(mode="json"),
        headers={"X-Sync-Ms": f"{timings.get('sync', 0):.3f}"},
    )


@router.get("/pull", response_model=SyncPullResponse)
async def pull_endpoint(
    since: datetime = Query(default=_EPOCH, description="ISO timestamp; pull records modified after this point"),
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Pull all records (including soft-deleted) modified after *since*.

    On the first sync, omit ``since`` to receive all records.  Store the
    returned ``server_timestamp`` and pass it as ``since`` on the next call.
    """
    timings: dict[str, float] = {}
    with time_operation("sync", timings):
        result = await pull_changes(session, authenticated_user_id, since)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=result.model_dump(mode="json"),
        headers={"X-Sync-Ms": f"{timings.get('sync', 0):.3f}"},
    )


@router.get("/status", response_model=SyncStatusResponse)
async def status_endpoint(
    authenticated_user_id: int = Depends(get_authenticated_user_id),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Return the latest ``updated_at`` per entity type for the authenticated user."""
    timings: dict[str, float] = {}
    with time_operation("sync", timings):
        result = await get_sync_status(session, authenticated_user_id)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=result.model_dump(mode="json"),
        headers={"X-Sync-Ms": f"{timings.get('sync', 0):.3f}"},
    )
