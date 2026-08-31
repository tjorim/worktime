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

import { EventSourceParserStream } from "eventsource-parser/stream";
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
  subscribe(
    onSignal: (serverTimestamp: string, options?: { forcePull?: boolean }) => void,
  ): () => void;
}

// ---------------------------------------------------------------------------
// SSE transport adapter
// ---------------------------------------------------------------------------

const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const RETRY_AFTER_JITTER_RATIO = 0.2;

/** Whether the response status means "your token is bad" — not worth retrying blindly. */
function isFatalAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

/** Parse either form allowed by Retry-After: delay-seconds or an HTTP date. */
function parseRetryAfterMs(value: string | null): number {
  if (value === null) return 0;

  const delaySeconds = Number(value);
  if (value.trim() !== "" && Number.isFinite(delaySeconds) && delaySeconds >= 0) {
    return delaySeconds * 1_000;
  }

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? 0 : Math.max(0, retryAt - Date.now());
}

/**
 * Create a fetch-based `SyncSignalTransport` that connects to the given URL
 * with a Bearer token.
 *
 * `GET /api/sync/events` authenticates the same way as every other endpoint —
 * an `Authorization: Bearer <token>` header — which native `EventSource`
 * cannot send (it has no API for custom request headers; `withCredentials`
 * only forwards cookies, and the backend has no cookie-based auth). This
 * transport opens the stream via a plain `fetch()` instead, so the token can
 * be attached like any other request, and pipes the response body through
 * `eventsource-parser`'s `EventSourceParserStream` to turn it into SSE
 * messages. (Not `@microsoft/fetch-event-source`, which bundled this same
 * fetch+parse+retry shape — its last real release was 2021; `eventsource-parser`
 * is actively maintained and the parsing is the one part worth not
 * hand-rolling. The reconnect/backoff loop below is ours either way.)
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
      let stopped = false;
      let controller: AbortController | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let retryMs = INITIAL_RETRY_MS;
      // The server's per-connection event queue (maxsize=1) only exists while
      // a connection is open — any sync_changed notification fired during a
      // drop is lost, not queued. After every failed attempt or dropped
      // connection, force a catch-up pull once the next connection succeeds.
      // This includes a failure before the first successful connection: the
      // initial pull may already have completed while the stream was down.
      let shouldCatchUpOnConnect = false;

      function scheduleReconnect(retryAfterMs = 0) {
        if (stopped) return;
        shouldCatchUpOnConnect = true;
        const interval = Math.max(retryMs, retryAfterMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, interval);
      }

      function handleMessage(event: { event?: string; data: string }) {
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
      }

      async function connect() {
        controller = new AbortController();
        try {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: EVENT_STREAM_CONTENT_TYPE },
            signal: controller.signal,
          });

          if (isFatalAuthStatus(response.status)) {
            logger.warn(
              "useSyncSignal: SSE authentication failed — giving up until reconnect:",
              response.status,
            );
            return; // No scheduleReconnect(): a bad token won't fix itself on retry.
          }
          if (response.status === 429) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
            // Retry-After is a minimum. Add a small positive jitter so tabs
            // rejected at the same time do not all reconnect in lockstep.
            const jitteredRetryAfterMs = retryAfterMs
              + Math.random() * retryAfterMs * RETRY_AFTER_JITTER_RATIO;
            logger.debug(
              "useSyncSignal: SSE connection limit reached — retrying later:",
              jitteredRetryAfterMs,
            );
            scheduleReconnect(jitteredRetryAfterMs);
            return;
          }
          if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith(EVENT_STREAM_CONTENT_TYPE)) {
            throw new Error(`SSE connection failed: ${response.status}`);
          }

          retryMs = INITIAL_RETRY_MS;
          if (shouldCatchUpOnConnect) {
            // Recovery must bypass timestamp deduplication. The cursor comes
            // from the server, so comparing it with the browser clock could
            // suppress this required pull when the clocks differ.
            onSignal(new Date().toISOString(), { forcePull: true });
            shouldCatchUpOnConnect = false;
          }

          const reader = response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new EventSourceParserStream())
            .getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            handleMessage(value);
          }
          // The stream ended (server closed the connection, e.g. a deploy) —
          // treat exactly like a dropped connection and reconnect.
          if (!stopped) {
            scheduleReconnect();
          }
        } catch (err) {
          if (stopped) return; // Expected: abort() from the cleanup function below.
          logger.debug("useSyncSignal: SSE connection error — retrying:", err);
          scheduleReconnect();
        }
      }

      connect();

      return () => {
        stopped = true;
        if (retryTimer !== null) {
          clearTimeout(retryTimer);
        }
        controller?.abort();
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

    const unsubscribe = transport.subscribe((serverTimestamp, options) => {
      if (options?.forcePull) {
        triggerPullRef.current();
        return;
      }

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
