/**
 * useSyncSignal
 *
 * Transport-neutral SSE listener that invokes `triggerPull` when a
 * `sync_changed` signal is received from the server.
 *
 * Architecture (per docs/realtime-sync-architecture.md §2–§4):
 *
 * - **Notify-then-pull**: the signal carries only a freshness hint (a
 *   `server_timestamp`); all data is fetched via the existing incremental
 *   pull path (`triggerPull` from `useOngoingSync`).
 *
 * - **Deduplication**: if the stored sync cursor is already at or ahead of
 *   the signal's `server_timestamp`, the pull is skipped — the client is
 *   already up to date.
 *
 * - **Transport-neutral**: the hook accepts a `SyncSignalTransport` instance
 *   rather than hard-coding `EventSource` API calls.  Replacing SSE with
 *   WebSockets in a future phase requires only a new transport adapter; no
 *   changes to this hook or its callers are needed.
 *
 * - **Lifecycle**: the hook subscribes when both `isActive` is true and a
 *   transport is provided.  The transport's cleanup function is called on
 *   unmount or when inputs change.
 */

import { useEffect, useRef } from "react";
import { getSyncCursorKey } from "@/constants/storageKeys";
import type { TriggerPullFn } from "@/hooks/useOngoingSync";

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/**
 * Transport-neutral interface for receiving sync-changed signals.
 *
 * Implementations must call the provided `onSignal` callback whenever a
 * `sync_changed` event arrives, passing the event's `server_timestamp`
 * string.  The `subscribe` method must return a cleanup/disconnect function
 * that stops the connection and prevents further `onSignal` calls.
 *
 * Consumers of `useSyncSignal` depend only on this interface; the concrete
 * transport (SSE, WebSocket, etc.) is an implementation detail supplied at
 * the call site.
 */
export interface SyncSignalTransport {
  /**
   * Start receiving sync signals.
   *
   * @param onSignal - Called with each signal's ISO-8601 `server_timestamp`.
   * @returns A cleanup function that disconnects the transport.
   */
  subscribe(onSignal: (serverTimestamp: string) => void): () => void;
}

// ---------------------------------------------------------------------------
// SSE transport adapter
// ---------------------------------------------------------------------------

/**
 * Create an SSE-based `SyncSignalTransport` that connects to the given URL.
 *
 * The returned transport opens an `EventSource` connection on `subscribe()`
 * and listens for `sync_changed` events.  It uses `withCredentials: true` so
 * that the browser's session cookie is included, satisfying the authentication
 * requirement for the `/api/sync/events` endpoint.
 *
 * `EventSource` reconnects automatically on network interruptions; no manual
 * reconnect logic is needed.
 *
 * @param url - The full URL of the SSE endpoint (e.g. `https://api/sync/events`).
 */
export function createSseTransport(url: string): SyncSignalTransport {
  return {
    subscribe(onSignal) {
      const es = new EventSource(url, { withCredentials: true });

      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as { type?: string; server_timestamp?: string };
          if (typeof data.server_timestamp === "string") {
            onSignal(data.server_timestamp);
          }
        } catch {
          // Ignore malformed event data.
          console.warn("useSyncSignal: failed to parse SSE event data:", event.data);
        }
      };

      es.addEventListener("sync_changed", handleMessage);

      es.onerror = () => {
        // EventSource reconnects automatically; log for observability only.
        console.warn("useSyncSignal: SSE connection error — will retry automatically.");
      };

      return () => {
        es.removeEventListener("sync_changed", handleMessage);
        es.close();
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to sync-changed signals and invoke `triggerPull` on each new
 * signal.
 *
 * Signals whose `server_timestamp` is not newer than the stored sync cursor
 * are silently dropped (deduplication), avoiding redundant pull round trips
 * for bursty or duplicate signals.
 *
 * @param isActive - Whether sync is currently active (user authenticated and
 *   sync established).  When false the hook is a no-op.
 * @param userId - The authenticated user's ID, used to look up the cursor key.
 * @param triggerPull - Entry point from `useOngoingSync` to trigger an
 *   incremental flush-and-pull cycle.
 * @param transport - The signal transport to subscribe to, or null to
 *   disable signaling (e.g. when unauthenticated).
 */
export function useSyncSignal(
  isActive: boolean,
  userId: string | null,
  triggerPull: TriggerPullFn,
  transport: SyncSignalTransport | null,
): void {
  // Keep a stable ref to `triggerPull` so the subscription closure does not
  // become stale when the identity of `triggerPull` changes between renders.
  const triggerPullRef = useRef(triggerPull);
  useEffect(() => {
    triggerPullRef.current = triggerPull;
  }, [triggerPull]);

  useEffect(() => {
    if (!isActive || !userId || !transport) return;

    const unsubscribe = transport.subscribe((serverTimestamp) => {
      const serverTimestampMs = Date.parse(serverTimestamp);
      if (Number.isNaN(serverTimestampMs)) {
        console.warn(
          "useSyncSignal: received invalid server_timestamp from sync signal (expected ISO-8601 date):",
          serverTimestamp,
        );
        return;
      }

      // Dedup: skip pull if the local cursor is already at or ahead of the signal.
      const cursor = localStorage.getItem(getSyncCursorKey(userId));
      if (cursor !== null) {
        const cursorMs = Date.parse(cursor);
        if (Number.isNaN(cursorMs)) {
          console.warn(
            "useSyncSignal: stored sync cursor is corrupted and will be removed; triggering a full pull:",
            cursor,
          );
          localStorage.removeItem(getSyncCursorKey(userId));
        } else if (cursorMs >= serverTimestampMs) {
          return;
        }
      }
      triggerPullRef.current();
    });

    return unsubscribe;
  }, [isActive, userId, transport]);
}
