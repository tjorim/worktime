"""Per-user SSE connection manager for sync_changed event broadcasting."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime

logger = logging.getLogger(__name__)


def _build_sse_message(event: str, data: dict) -> str:
    """Format a single SSE frame: ``event: <name>\\ndata: <json>\\n\\n``."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class SyncEventManager:
    """Manages per-user asyncio queues for SSE sync_changed broadcasting.

    Each active ``GET /api/sync/events`` connection registers an
    :class:`asyncio.Queue` here.  When syncable data changes for a user,
    :meth:`broadcast_sync_changed` enqueues a formatted SSE frame for every
    connected client of that user.

    The manager is intentionally *stateless* with respect to event history:
    no replay, no checkpoints.  Missed events (due to disconnection) are
    recovered by the client's incremental pull on reconnect.
    """

    def __init__(self) -> None:
        # user_id → set of asyncio queues, one per active SSE connection
        self._queues: dict[int, set[asyncio.Queue[str]]] = defaultdict(set)

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

    async def broadcast_sync_changed(self, user_id: int) -> int:
        """Enqueue a ``sync_changed`` SSE frame for every active connection of *user_id*.

        Returns the number of connected clients notified, or ``0`` if the user
        has no active SSE connections.
        """
        queues = self._queues.get(user_id)
        if not queues:
            return 0
        message = _build_sse_message(
            "sync_changed",
            {"type": "sync_changed", "server_timestamp": datetime.now(UTC).isoformat()},
        )
        for queue in list(queues):
            await queue.put(message)
        count = len(queues)
        logger.debug("SSE: broadcast sync_changed to %d client(s) for user %d", count, user_id)
        return count


#: Module-level singleton; imported by routers that need to broadcast sync events.
sync_event_manager = SyncEventManager()
