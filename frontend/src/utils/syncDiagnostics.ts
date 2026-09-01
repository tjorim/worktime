import { CONFIG } from "@/utils/config";
import { logger } from "@/utils/logger";
import type { FetchFn, SyncPushPayload } from "@/utils/syncClient";

type SyncEntityKey =
  | "labels"
  | "tasks"
  | "templates"
  | "work_locations"
  | "time_off_entries"
  | "gantt_tasks";

export type SyncDiagnosticPhase =
  | "status"
  | "local_read"
  | "push"
  | "pull"
  | "local_apply"
  | "preferences"
  | "cursor";

export interface SyncAttemptDiagnostics {
  attemptId: string;
  requestIds: Set<string>;
}

interface DiagnosticEvent {
  event: "sync_failure" | "sync_conflict";
  phase: SyncDiagnosticPhase;
  code: string;
  error?: unknown;
  conflictCount?: number;
  entityCounts?: Partial<Record<SyncEntityKey, number>>;
}

export function createSyncAttemptDiagnostics(): SyncAttemptDiagnostics {
  return { attemptId: crypto.randomUUID(), requestIds: new Set<string>() };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches the backend's request_ids max_length so a long-running attempt (retries,
 * chunked pushes) can't grow the set past what the diagnostics schema accepts. */
const MAX_TRACKED_REQUEST_IDS = 20;

/** Wrap authenticated fetch so API request IDs can be correlated with a client failure. */
export function trackSyncRequests(
  fetch: FetchFn,
  diagnostics: SyncAttemptDiagnostics,
): FetchFn {
  return async (url, init) => {
    const response = await fetch(url, init);
    const requestId = response.headers?.get("X-Request-ID");
    // The backend echoes back a caller-supplied X-Request-ID verbatim if one was
    // sent (e.g. by an intervening proxy), so this is not guaranteed to be a UUID.
    // The diagnostics endpoint's schema requires UUIDs and rejects the whole
    // payload if any entry doesn't match, so a single non-UUID id would silently
    // kill an otherwise-valid report.
    if (requestId && UUID_PATTERN.test(requestId) && !diagnostics.requestIds.has(requestId)) {
      if (diagnostics.requestIds.size >= MAX_TRACKED_REQUEST_IDS) {
        // Sets iterate in insertion order — drop the oldest to keep the ids most
        // likely to be relevant to whatever ends up failing.
        const oldest = diagnostics.requestIds.values().next().value;
        if (oldest !== undefined) diagnostics.requestIds.delete(oldest);
      }
      diagnostics.requestIds.add(requestId);
    }
    return response;
  };
}

export function countSyncPayloadEntities(
  payload: SyncPushPayload,
): Record<SyncEntityKey, number> {
  return {
    labels: payload.labels.length,
    tasks: payload.tasks.length,
    templates: payload.templates.length,
    work_locations: payload.work_locations.length,
    time_off_entries: payload.time_off_entries.length,
    gantt_tasks: payload.gantt_tasks.length,
  };
}

/**
 * Emit detailed local evidence and best-effort privacy-bounded server telemetry.
 * The server payload contains counts and identifiers only, never record contents.
 */
export function reportSyncDiagnostic(
  fetch: FetchFn,
  diagnostics: SyncAttemptDiagnostics,
  event: DiagnosticEvent,
): void {
  const error = event.error;
  const errorName = error instanceof Error ? error.name : undefined;
  const consoleEvent = {
    event: event.event,
    attemptId: diagnostics.attemptId,
    phase: event.phase,
    code: event.code,
    conflictCount: event.conflictCount ?? 0,
    entityCounts: event.entityCounts ?? {},
    requestIds: [...diagnostics.requestIds],
    appVersion: CONFIG.VERSION,
  };

  if (event.event === "sync_failure") {
    logger.error("Worktime sync diagnostic", consoleEvent, error);
  } else {
    logger.warn("Worktime sync diagnostic", consoleEvent);
  }

  // Start from an already-resolved promise so even a malformed/test fetch
  // implementation that throws synchronously cannot affect the sync flow.
  void Promise.resolve()
    .then(() =>
      fetch("/api/client-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: event.event,
          attempt_id: diagnostics.attemptId,
          app_version: CONFIG.VERSION,
          phase: event.phase,
          code: event.code,
          error_name: errorName,
          conflict_count: event.conflictCount ?? 0,
          entity_counts: event.entityCounts ?? {},
          request_ids: [...diagnostics.requestIds],
        }),
        keepalive: true,
      }),
    )
    .then((response) => {
      if (response && !response.ok) {
        logger.warn("Worktime sync diagnostic endpoint rejected the event", {
          attemptId: diagnostics.attemptId,
          status: response.status,
        });
      }
    })
    .catch((reportError: unknown) => {
      logger.warn("Failed to report Worktime sync diagnostic", {
        attemptId: diagnostics.attemptId,
        reportError,
      });
    });
}
