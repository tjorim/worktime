/**
 * useSyncSignal
 *
 * Transport-neutral SSE listener that invokes `triggerPull` when a
 * `sync_changed` signal is received from the server.
 *
 * Architecture:
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
 *
 * - **Reconnect recovery**: the server's per-connection event queue does not
 *   survive a dropped connection, so `createFetchSseTransport` forces a
 *   catch-up pull on every *re*connect (not the first connection), skipping
 *   the dedup check — see its implementation for details.
 */

import { fetchEventSource, EventStreamContentType } from "@microsoft/fetch-event-source";
import { useEffect, useRef } from "react";
import { getSyncCursorKey } from "@/constants/storageKeys";
import type { TriggerPullFn } from "@/hooks/useOngoingSync";
import { logger } from "@/utils/logger";

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

/** Thrown from `onopen`/`onerror` to stop `fetchEventSource` from retrying. */
class FatalSseError extends Error {}

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Create a fetch-based `SyncSignalTransport` that connects to the given URL
 * with a Bearer token.
 *
 * `GET /api/sync/events` authenticates the same way as every other endpoint —
 * an `Authorization: Bearer <token>` header — which native `EventSource`
 * cannot send (it has no API for custom request headers; `withCredentials`
 * only forwards cookies, and the backend has no cookie-based auth). This
 * transport uses `@microsoft/fetch-event-source` to open the stream via
 * `fetch()` instead, so the token can be attached like any other request.
 *
 * Reconnects with exponential backoff on network/stream errors. A 401/403
 * response is treated as fatal (stops retrying) rather than hammering the
 * endpoint with a token the server has already rejected — `OngoingSyncContext`
 * recreates this transport whenever the access token changes (e.g. after a
 * silent renewal), which re-subscribes with a fresh token.
 *
 * @param url - The full URL of the SSE endpoint (e.g. `https://api/sync/events`).
 * @param accessToken - The current OIDC access token to send as a Bearer header.
 */
export function createFetchSseTransport(url: string, accessToken: string): SyncSignalTransport {
  return {
    subscribe(onSignal) {
      const controller = new AbortController();
      let retryMs = INITIAL_RETRY_MS;
      // The server's per-connection event queue (maxsize=1) only exists while
      // a connection is open — any sync_changed notification fired during a
      // drop is lost, not queued. On every *re*connect (not the first
      // connection, which already gets its own initial pull on mount), force
      // a catch-up pull with a synthetic "now" timestamp so it always beats
      // the dedup check in useSyncSignal, regardless of whether anything was
      // actually missed.
      let hasConnectedOnce = false;

      fetchEventSource(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
        async onopen(response) {
          if (response.ok && response.headers.get("content-type")?.startsWith(EventStreamContentType)) {
            retryMs = INITIAL_RETRY_MS;
            if (hasConnectedOnce) {
              onSignal(new Date().toISOString());
            }
            hasConnectedOnce = true;
            return;
          }
          if (response.status === 401 || response.status === 403) {
            throw new FatalSseError(`SSE authentication failed: ${response.status}`);
          }
          throw new Error(`SSE connection failed: ${response.status}`);
        },
        onmessage(event) {
          if (event.event !== "sync_changed") return;
          try {
            const data = JSON.parse(event.data) as { type?: string; server_timestamp?: string };
            if (typeof data.server_timestamp === "string") {
              onSignal(data.server_timestamp);
            }
          } catch {
            // Ignore malformed event data.
            logger.warn("useSyncSignal: failed to parse SSE event data:", event.data);
          }
        },
        onerror(err) {
          if (err instanceof FatalSseError) {
            logger.warn("useSyncSignal: SSE authentication failed — giving up until reconnect:", err);
            throw err; // Rethrowing tells fetchEventSource to stop retrying.
          }
          // Any other error (network blip, proxy interruption, non-2xx status)
          // gets an exponential-backoff retry; using debug level avoids console
          // spam on flaky networks.
          logger.debug("useSyncSignal: SSE connection error — retrying:", err);
          const interval = retryMs;
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
          return interval;
        },
      }).catch(() => {
        // Fatal errors and aborts both settle this promise; already logged
        // above (or expected, for a clean unsubscribe) — nothing more to do.
      });

      return () => {
        controller.abort();
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
        logger.warn(
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
          logger.warn(
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
