"""Per-user SSE connection manager for sync_changed event broadcasting.

Uses a Postgres LISTEN/NOTIFY channel (``worktime_sync_changed``) to relay
notifications across multiple worker processes.  Per-process asyncio queues are
filled by the NOTIFY listener callback, ensuring all workers receive events
regardless of which worker handled the originating push.

If the Postgres connection is unavailable (DATABASE_ENABLED=False, tests, or a
transient failure) the manager falls back to local in-process delivery so the
SSE endpoint keeps working within a single process.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime
from urllib.parse import urlparse, urlunparse

import asyncpg

logger = logging.getLogger(__name__)

_NOTIFY_CHANNEL = "worktime_sync_changed"


def _redact_credentials(db_url: object) -> str:
    """Return db_url with any embedded userinfo credentials redacted, safe to log."""
    if not isinstance(db_url, str):
        return repr(db_url)
    try:
        parsed = urlparse(db_url)
    except ValueError:
        return "<unparseable>"
    if not (parsed.username or parsed.password):
        return db_url
    netloc = parsed.hostname or ""
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    if parsed.username:
        netloc = f"{parsed.username}:***@{netloc}"
    return urlunparse(parsed._replace(netloc=netloc))


def _build_sse_message(event: str, data: dict) -> str:
    """Format a single SSE frame: ``event: <name>\\ndata: <json>\\n\\n``."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class SyncEventManager:
    """Manages per-user asyncio queues for SSE sync_changed broadcasting.

    **Per-process local delivery**

    Each active ``GET /api/sync/events`` connection registers a *bounded*
    :class:`asyncio.Queue[str]` (``maxsize=1``) here.  The Postgres LISTEN
    callback (or the local fallback) fills queues via :meth:`_enqueue_local`.

    **Cross-process delivery (multi-worker)**

    :meth:`broadcast_sync_changed` sends a ``NOTIFY worktime_sync_changed``
    Postgres notification with ``user_id`` as the payload.  Each worker
    process runs a background LISTEN connection; the callback calls
    :meth:`_enqueue_local` so every worker sees the notification.

    **Queue coalescing**

    Each SSE connection uses ``asyncio.Queue(maxsize=1)`` (bounded).
    :meth:`_enqueue_local` uses ``put_nowait``; when a queue already holds a
    pending hint the duplicate is silently dropped.  The hint is idempotent
    ("pull now"), so dropping duplicates is correct and prevents slow clients
    from accumulating a backlog of identical frames.
    """

    def __init__(self) -> None:
        # user_id → set of asyncio queues, one per active SSE connection
        self._queues: dict[int, set[asyncio.Queue[str]]] = defaultdict(set)
        self._listen_conn: asyncpg.Connection | None = None
        self._notify_conn: asyncpg.Connection | None = None

    # ------------------------------------------------------------------
    # Local queue management
    # ------------------------------------------------------------------

    def subscribe(self, user_id: int, queue: asyncio.Queue[str]) -> None:
        """Register *queue* as an active SSE connection for *user_id*."""
        self._queues[user_id].add(queue)
        logger.debug("SSE: user %d subscribed (%d total)", user_id, len(self._queues[user_id]))

    def unsubscribe(self, user_id: int, queue: asyncio.Queue[str]) -> None:
        """Remove *queue* from the registry when the SSE connection closes."""
        queues = self._queues.get(user_id)
        if queues is not None:
            queues.discard(queue)
            if not queues:
                del self._queues[user_id]
        logger.debug("SSE: user %d unsubscribed", user_id)

    def _enqueue_local(self, user_id: int) -> int:
        """Enqueue a freshness hint to every local SSE queue for *user_id*.

        Uses non-blocking ``put_nowait``; if a queue already holds a pending
        hint (``QueueFull``) the duplicate is silently dropped.  Since the
        signal is idempotent ("pull now"), dropping duplicates is correct.

        Returns the number of local queues that accepted the message.
        """
        queues = self._queues.get(user_id)
        if not queues:
            return 0
        message = _build_sse_message(
            "sync_changed",
            {"type": "sync_changed", "server_timestamp": datetime.now(UTC).isoformat()},
        )
        count = 0
        for queue in list(queues):
            try:
                queue.put_nowait(message)
                count += 1
            except asyncio.QueueFull:
                logger.debug("SSE: queue full for user %d — dropping duplicate hint", user_id)
        logger.debug("SSE: enqueued sync_changed to %d local client(s) for user %d", count, user_id)
        return count

    # ------------------------------------------------------------------
    # Postgres LISTEN / NOTIFY
    # ------------------------------------------------------------------

    async def broadcast_sync_changed(self, user_id: int) -> int:
        """Notify all connected clients of *user_id* that sync data has changed.

        Attempts to publish a Postgres NOTIFY on channel ``worktime_sync_changed``
        via :meth:`_pg_notify`.  If NOTIFY succeeds, all worker processes receive
        the event via their LISTEN connection and fill their local SSE queues
        asynchronously.

        Falls back to direct :meth:`_enqueue_local` when the Postgres NOTIFY
        connection is unavailable or when sending the NOTIFY fails (e.g. tests
        or ``DATABASE_ENABLED=False``), so local SSE subscribers always receive
        hints even without a shared pub/sub layer.

        Returns the number of local queues notified in the fallback path, or
        ``0`` when the Postgres path successfully delivered the notification.
        """
        if await self._pg_notify(user_id):
            return 0
        return self._enqueue_local(user_id)

    async def _pg_notify(self, user_id: int) -> bool:
        """Send ``NOTIFY worktime_sync_changed, '<user_id>'`` via asyncpg.

        PostgreSQL's bare ``NOTIFY`` statement does not support bind parameters
        so we use the ``pg_notify(channel, payload)`` function via ``SELECT``
        which accepts ``$1``/``$2`` placeholders safely.

        Returns ``True`` if the NOTIFY was sent, else ``False`` so callers can
        fall back to in-process delivery.
        """
        conn = self._notify_conn
        if conn is None or conn.is_closed():
            logger.debug("SSE: notify connection unavailable — skipping cross-process NOTIFY")
            return False
        try:
            await conn.execute("SELECT pg_notify($1, $2)", _NOTIFY_CHANNEL, str(user_id))
            return True
        except Exception:
            logger.warning("SSE: Postgres NOTIFY failed (non-fatal)", exc_info=True)
            return False

    def _pg_listener_callback(
        self,
        conn: asyncpg.Connection,
        pid: int,
        channel: str,
        payload: str,
    ) -> None:
        """asyncpg notification callback — relay NOTIFY to local SSE queues.

        Called by asyncpg for every ``NOTIFY worktime_sync_changed`` received
        on this process's LISTEN connection, including notifications that
        originated from other worker processes.

        asyncpg invokes this callback synchronously on the event loop thread
        (not in a separate thread), so calling the non-blocking ``put_nowait``
        inside ``_enqueue_local`` is safe — no thread-safety concerns apply.
        """
        try:
            user_id = int(payload)
        except (ValueError, TypeError):
            logger.warning("SSE: received non-integer NOTIFY payload: %r", payload)
            return
        self._enqueue_local(user_id)

    async def start_pg_listener(self, db_url: str) -> None:
        """Open asyncpg connections and register the LISTEN callback.

        *db_url* is the ``postgresql+asyncpg://`` SQLAlchemy URL; the
        ``+asyncpg`` dialect prefix is stripped before passing to asyncpg.

        Failures are logged and swallowed — the SSE endpoint continues to work
        within a single worker process without cross-process broadcast.
        """
        if not isinstance(db_url, str) or not db_url:
            logger.warning(
                "SSE: DATABASE_URL is not a valid string (%r); LISTEN/NOTIFY will not be started",
                _redact_credentials(db_url),
            )
            return
        parsed = urlparse(db_url)
        if parsed.scheme != "postgresql+asyncpg":
            logger.warning(
                "SSE: DATABASE_URL does not start with 'postgresql+asyncpg://' (%r); LISTEN/NOTIFY will not be started",
                _redact_credentials(db_url),
            )
            return
        asyncpg_url = urlunparse(parsed._replace(scheme="postgresql"))
        # Note: further URL validation (host, port, credentials) is deferred to
        # asyncpg.connect(); any connection error is caught in the try/except below
        # and causes graceful degradation to single-process mode.
        try:
            self._listen_conn = await asyncpg.connect(asyncpg_url)
            await self._listen_conn.add_listener(_NOTIFY_CHANNEL, self._pg_listener_callback)
            self._notify_conn = await asyncpg.connect(asyncpg_url)
            logger.info(
                "✓ SSE: Postgres LISTEN/NOTIFY connections established on channel %r",
                _NOTIFY_CHANNEL,
            )
        except Exception:
            logger.warning(
                "SSE: Postgres LISTEN/NOTIFY setup failed — SSE will work within a single worker only",
                exc_info=True,
            )
            await self.stop_pg_listener()

    async def stop_pg_listener(self) -> None:
        """Remove the LISTEN callback and close asyncpg connections."""
        had_connections = self._listen_conn is not None or self._notify_conn is not None
        if self._listen_conn is not None:
            try:
                await self._listen_conn.remove_listener(_NOTIFY_CHANNEL, self._pg_listener_callback)
                await self._listen_conn.close()
            except Exception:
                logger.debug("SSE: error closing listen connection", exc_info=True)
            finally:
                self._listen_conn = None
        if self._notify_conn is not None:
            try:
                await self._notify_conn.close()
            except Exception:
                logger.debug("SSE: error closing notify connection", exc_info=True)
            finally:
                self._notify_conn = None
        if had_connections:
            logger.info("SSE: Postgres LISTEN/NOTIFY connections closed")


#: Module-level singleton; imported by routers and wired up in main.py lifespan.
sync_event_manager = SyncEventManager()


async def notify_sync_changed(user_id: int) -> None:
    """Broadcast a ``sync_changed`` hint for *user_id*, swallowing all errors.

    The hint is a freshness signal only — a failed broadcast must never fail
    the write that triggered it, so every exception is logged and suppressed.
    """
    try:
        await sync_event_manager.broadcast_sync_changed(user_id)
    except Exception:
        logger.warning(
            "SSE: broadcast_sync_changed failed for user %d (non-fatal)", user_id, exc_info=True
        )
