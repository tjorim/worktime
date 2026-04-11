"""REST API endpoints for bidirectional SQLite sync."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
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
from app.utils.sse_manager import sync_event_manager
from app.utils.timing import time_operation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# Keepalive interval for SSE connections (seconds).  A comment line is sent
# when no real event arrives within this window to prevent proxy/firewall
# idle-connection timeouts.
_SSE_KEEPALIVE_TIMEOUT = 15.0


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

    try:
        await sync_event_manager.broadcast_sync_changed(authenticated_user_id)
    except Exception:
        logger.warning(
            "SSE: broadcast_sync_changed failed for user %d (non-fatal)", authenticated_user_id, exc_info=True
        )

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


@router.get("/events")
async def events_endpoint(
    request: Request,
    authenticated_user_id: int = Depends(get_authenticated_user_id),
) -> StreamingResponse:
    """SSE stream delivering ``sync_changed`` events for the authenticated user.

    The server emits a frame whenever syncable data changes for the connected
    user (e.g. after a successful push from another device)::

        event: sync_changed
        data: {"type":"sync_changed","server_timestamp":"<ISO-8601>"}

    The payload is a *freshness hint only* — no record data is included.
    Clients should follow up with ``GET /api/sync/pull?since=<cursor>`` on each
    event (notify-then-pull pattern).

    Keepalive comment lines (``": keepalive"``) are sent every
    ``_SSE_KEEPALIVE_TIMEOUT`` seconds to prevent proxy/firewall
    idle-connection timeouts.

    The browser reconnects automatically on drop; **no event replay** is
    performed on reconnect.  Missed events are recovered by the incremental
    pull that the client issues on reconnect anyway.
    """
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
    sync_event_manager.subscribe(authenticated_user_id, queue)

    async def event_generator():
        # Race queue delivery against client disconnect so the coroutine exits
        # promptly on an unclean TCP drop rather than waiting up to
        # _SSE_KEEPALIVE_TIMEOUT seconds for the next write to fail.
        disconnect_task = asyncio.create_task(request.is_disconnected())
        try:
            while True:
                queue_task = asyncio.create_task(queue.get())
                done, _ = await asyncio.wait(
                    {queue_task, disconnect_task},
                    timeout=_SSE_KEEPALIVE_TIMEOUT,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if disconnect_task in done:
                    queue_task.cancel()
                    logger.debug("SSE: client disconnected for user %d", authenticated_user_id)
                    break

                if queue_task in done:
                    yield queue_task.result()
                else:
                    # Timeout — send keepalive and loop
                    queue_task.cancel()
                    yield ": keepalive\n\n"
        finally:
            if not disconnect_task.done():
                disconnect_task.cancel()
            sync_event_manager.unsubscribe(authenticated_user_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Disable Caddy / nginx response buffering so frames reach the
            # client immediately rather than accumulating in a proxy buffer.
            "X-Accel-Buffering": "no",
        },
    )
