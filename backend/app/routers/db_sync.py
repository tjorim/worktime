"""REST API endpoints for bidirectional SQLite sync."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.engine import get_session
from app.middleware.rate_limit import limiter
from app.routers.auth import get_authenticated_user_id, get_authenticated_user_id_shortlived
from app.schemas import (
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    SyncStatusResponse,
)
from app.services.db_service import NotFoundError, ValidationError
from app.services.sync_service import (
    BulkDeleteGuardError,
    get_sync_status,
    pull_changes,
    push_changes,
)
from app.utils.sse_manager import notify_sync_changed, sync_event_manager
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
    except BulkDeleteGuardError as error:
        # 409, not 400: the batch is well-formed and the client may legitimately
        # retry it verbatim with allow_bulk_delete once the user has confirmed
        # that erasing the account's data is what they meant.
        logger.warning(
            "sync push refused by bulk-delete guard for user %d: %s",
            authenticated_user_id,
            error,
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except (ValidationError, NotFoundError) as error:
        # NotFoundError surfaces from _validate_task_gantt_reference (a task
        # or template linking to a gantt_task_id that doesn't exist, or was
        # deleted on another device between pull and push) — a plausible
        # everyday race in a multi-device offline-first client, not just a
        # malformed-payload edge case, so it must map to 400 rather than
        # bubbling up as an unhandled 500.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    await notify_sync_changed(authenticated_user_id)

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
@limiter.exempt
async def events_endpoint(
    request: Request,
    authenticated_user_id: int = Depends(get_authenticated_user_id_shortlived),
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

    Each connection's event queue (maxsize=1) only exists while that
    connection is open — a notification fired during a drop has no queue to
    reach and is lost, not replayed on reconnect. The client is expected to
    force an unconditional catch-up pull whenever its SSE connection
    re-establishes (not just when an event arrives) to cover that gap; see
    ``createFetchSseTransport`` in the frontend.

    Authenticates via ``get_authenticated_user_id_shortlived``, which resolves
    the principal on its own short-lived session rather than the request-scoped
    one, so this long-lived stream doesn't pin a pooled connection for its
    entire lifetime (see ``get_principal_shortlived``). It's also exempt from
    the ordinary rate limiter: a stream is one long-lived connection, not one
    unit of request work, and the client only ever opens one at a time in
    normal use — ``sync_event_manager``'s own per-user connection cap is what
    now bounds a single account from accumulating unbounded concurrent streams.
    """
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
    if not sync_event_manager.subscribe(authenticated_user_id, queue):
        # 30s gives the server enough time to notice a stale/disconnected
        # stream (via is_disconnected() polling, at most _SSE_KEEPALIVE_TIMEOUT
        # apart) and free a slot, without the client retrying immediately.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many concurrent sync streams for this account",
            headers={"Retry-After": "30"},
        )

    async def event_generator():
        try:
            while True:
                # Check disconnect state at the start of each loop iteration.
                # Client disconnects may only be observed once per
                # `_SSE_KEEPALIVE_TIMEOUT` interval while waiting for events.
                # `request.is_disconnected()` returns a boolean, so keeping one
                # long-lived task and treating "task completed" as "client
                # disconnected" is incorrect: a completed task may simply mean
                # the answer was `False`. Poll each iteration instead.
                if await request.is_disconnected():
                    logger.debug("SSE: client disconnected for user %d", authenticated_user_id)
                    break

                queue_task = asyncio.create_task(queue.get())
                await asyncio.wait({queue_task}, timeout=_SSE_KEEPALIVE_TIMEOUT)

                if queue_task.done():
                    yield queue_task.result()
                else:
                    # Timeout — send keepalive and loop
                    queue_task.cancel()
                    yield ": keepalive\n\n"
        finally:
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
