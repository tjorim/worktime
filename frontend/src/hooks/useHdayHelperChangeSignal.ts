/**
 * useHdayHelperChangeSignal
 *
 * Subscribes to the local hday-helper's per-user SSE stream
 * (`GET /hday/:username/events`) and invokes `onChanged` whenever the
 * helper reports the file's etag changed — whether from this device's own
 * push, another device, or a direct edit on the share.
 *
 * This deliberately does not trigger an automatic pull: silently importing
 * could clobber in-progress local edits, so the signal is surfaced to the
 * caller (typically as a "pull now?" prompt) rather than acted on here.
 *
 * Mirrors the shape of `useSyncSignal`/`SyncSignalTransport` (notify via SSE,
 * act via a normal fetch) but is intentionally a separate, smaller
 * implementation: the helper has no auth, no sync cursor, and the "dedup"
 * question here is just "does this etag match what I already know?", which
 * only the caller (holding the last-known etag) can answer.
 */

import { EventSourceParserStream } from "eventsource-parser/stream";
import { useEffect, useRef } from "react";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/**
 * Transport-neutral interface for receiving hday-helper change notifications.
 *
 * Implementations must call `onChanged` whenever an `hday_changed` event
 * arrives, passing the file's new etag (or null if the file no longer
 * exists). `subscribe` must return a cleanup function that disconnects.
 */
export interface HdayChangeTransport {
  subscribe(onChanged: (etag: string | null) => void): () => void;
}

// ---------------------------------------------------------------------------
// SSE transport adapter
// ---------------------------------------------------------------------------

const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const RETRY_JITTER_RATIO = 0.2;

/**
 * Create a fetch-based `HdayChangeTransport` for one user's change stream.
 *
 * Uses plain `fetch()` (not native `EventSource`) purely for consistency with
 * `createFetchSseTransport` and to reuse the same parsing approach — unlike
 * the account's own sync stream, the helper has no auth, so a native
 * `EventSource` would work here too.
 *
 * @param url - Full URL of the helper's per-user events endpoint
 *   (`{helperBaseUrl}/hday/:username/events`).
 */
export function createHdayHelperChangeTransport(url: string): HdayChangeTransport {
  return {
    subscribe(onChanged) {
      let stopped = false;
      let controller: AbortController | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let retryMs = INITIAL_RETRY_MS;

      function scheduleReconnect() {
        if (stopped) return;
        const interval = retryMs + Math.random() * retryMs * RETRY_JITTER_RATIO;
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, interval);
      }

      function handleMessage(event: { event?: string; data: string }) {
        if (event.event !== "hday_changed") return;
        try {
          const data = JSON.parse(event.data) as { etag?: string | null };
          onChanged(data.etag ?? null);
        } catch {
          logger.warn("useHdayHelperChangeSignal: failed to parse SSE event data:", event.data);
        }
      }

      async function connect() {
        controller = new AbortController();
        try {
          const response = await fetch(url, {
            headers: { Accept: EVENT_STREAM_CONTENT_TYPE },
            signal: controller.signal,
          });

          if (
            !response.ok
            || !response.body
            || !response.headers.get("content-type")?.startsWith(EVENT_STREAM_CONTENT_TYPE)
          ) {
            throw new Error(`hday-helper change stream failed: ${response.status}`);
          }

          retryMs = INITIAL_RETRY_MS;

          const reader = response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new EventSourceParserStream())
            .getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            handleMessage(value);
          }
          if (!stopped) scheduleReconnect();
        } catch (err) {
          if (stopped) return; // Expected: abort() from the cleanup function below.
          logger.debug("useHdayHelperChangeSignal: connection error — retrying:", err);
          scheduleReconnect();
        }
      }

      connect();

      return () => {
        stopped = true;
        if (retryTimer !== null) clearTimeout(retryTimer);
        controller?.abort();
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a `HdayChangeTransport` and invoke `onChanged` on each signal.
 *
 * @param transport - The transport to subscribe to, or null to disable
 *   (e.g. when the helper isn't connected or no username is configured).
 * @param onChanged - Called with the file's new etag whenever it changes.
 */
export function useHdayHelperChangeSignal(
  transport: HdayChangeTransport | null,
  onChanged: (etag: string | null) => void,
): void {
  // Keep a stable ref so the subscription closure doesn't go stale when the
  // identity of `onChanged` changes between renders.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!transport) return;
    return transport.subscribe((etag) => onChangedRef.current(etag));
  }, [transport]);
}
