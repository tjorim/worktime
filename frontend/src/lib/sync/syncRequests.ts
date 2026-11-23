import type {
  SyncPullResponse,
  SyncPushPayload,
  SyncPushResponse,
  SyncStatusResponse,
} from "@/api-types";

/** A pull as the client hands it on: the server's response plus a marker only the client sets. */
export type SyncPullResult = SyncPullResponse & {
  /** The server rejected an expired cursor and this is the replacement pull. */
  full_resync_required?: boolean;
};

// ---------------------------------------------------------------------------
// Fetch wrappers
// ---------------------------------------------------------------------------

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Call GET /api/sync/status.
 * Returns null if the request fails (e.g. network error or 401/403 already
 * handled by the apiFetch wrapper).
 */
export async function fetchSyncStatus(fetch: FetchFn): Promise<SyncStatusResponse | null> {
  try {
    const response = await fetch("/api/sync/status");
    if (!response.ok) return null;
    return (await response.json()) as SyncStatusResponse;
  } catch {
    return null;
  }
}

/**
 * Returns true when the server holds at least one syncable record — including
 * stored preferences — for the authenticated account.
 */
export function syncStatusHasData(status: SyncStatusResponse): boolean {
  return syncStatusHasEntityData(status) || status.preferences_updated_at != null;
}

/**
 * Returns true when the server holds at least one syncable *entity* (label,
 * task, template, work location, time-off entry or gantt task).
 *
 * Deliberately excludes preferences.  Preferences are a single
 * last-write-wins blob that both sides reconcile by timestamp on their own
 * (see `reconcilePreferences`), so they are never a reason to ask the user to
 * choose between local and server data — and treating them as one is actively
 * dangerous: the settings blob exists on essentially every device that has
 * ever opened the app, so counting it would push almost every new sign-in into
 * the "both sides have data" conflict branch, where picking "keep local data"
 * replaces the account's real history with whatever this device happens to
 * hold.
 */
export function syncStatusHasEntityData(status: SyncStatusResponse): boolean {
  return (
    // Use != null (loose equality) to treat both null and undefined as "no data".
    // Tests and legacy callers may omit the newer fields from their mock objects.
    status.labels_updated_at != null ||
    status.tasks_updated_at != null ||
    status.templates_updated_at != null ||
    status.work_locations_updated_at != null ||
    status.time_off_entries_updated_at != null ||
    status.gantt_tasks_updated_at != null
  );
}
/**
 * Deduplicate by natural key, keeping the last (most-recent local) entry per
 * key.  The outbox merge concatenates multiple offline mutations, so the same
 * record may appear more than once.  Keeping only the newest entry is safe
 * because every queued mutation carries the full record (see collections.ts)
 * and the server upserts creates/updates by natural key.
 */
export function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}

let taskRejectionHandler: ((code: string) => void) | null = null;

export function setSyncTaskRejectionHandler(handler: ((code: string) => void) | null): void {
  taskRejectionHandler = handler;
}

/** Notify once per validation code; diagnostic conflict reasons never reach the UI. */
export function reportTaskRejections(response: SyncPushResponse): void {
  const codes = new Set(
    [
      ...(response.results?.tasks ?? []),
      ...(response.results?.templates ?? []),
      ...(response.results?.gantt_tasks ?? []),
    ]
      .filter((record) => record.status === "conflict" && record.code)
      .map((record) => record.code!),
  );
  for (const code of codes) taskRejectionHandler?.(code);
}

/**
 * Count the total number of conflict records across all entity types in a
 * push response.  Returns 0 when there are no conflicts.
 */
export function countPushConflicts(response: SyncPushResponse): number {
  return Object.values(response.results ?? {}).reduce(
    (total, records) => total + (records ?? []).filter((r) => r.status === "conflict").length,
    0,
  );
}

/**
 * Extract only the conflicted items from a push payload by matching them
 * against the conflict results in the push response.
 *
 * Returns a new payload containing only items whose server push was rejected
 * with `status='conflict'`.  Work locations are matched by `date` (their
 * natural key), all other entity types are matched by `id`.
 */
export function extractConflictedItems(
  payload: SyncPushPayload,
  response: SyncPushResponse,
): SyncPushPayload {
  const conflicted: Record<string, Set<string>> = {};
  for (const [entityType, results] of Object.entries(response.results ?? {})) {
    conflicted[entityType] = new Set(
      (results ?? []).filter((r) => r.status === "conflict").map((r) => r.id),
    );
  }
  const ids = (key: string): Set<string> => conflicted[key] ?? new Set();

  return {
    labels: dedupeByKey(
      payload.labels.filter((l) => ids("labels").has(l.id)),
      (l) => l.id,
    ),
    tasks: dedupeByKey(
      payload.tasks.filter((t) => ids("tasks").has(t.id)),
      (t) => t.id,
    ),
    templates: dedupeByKey(
      payload.templates.filter((t) => ids("templates").has(t.id)),
      (t) => t.id,
    ),
    // work_locations use `date` as their natural key; the server returns it as `id`.
    work_locations: dedupeByKey(
      payload.work_locations.filter((w) => ids("work_locations").has(w.date)),
      (w) => w.date,
    ),
    time_off_entries: dedupeByKey(
      payload.time_off_entries.filter((e) => ids("time_off_entries").has(e.id)),
      (e) => e.id,
    ),
    gantt_tasks: dedupeByKey(
      payload.gantt_tasks.filter((g) => ids("gantt_tasks").has(g.id)),
      (g) => g.id,
    ),
  };
}

/**
 * Extract the maximum `server_updated_at` timestamp from the conflict results
 * in a push response.  Returns undefined if no conflicted records reported a
 * server timestamp.  Used as the `serverTimestampFloor` argument to
 * `bumpClientTimestamps` so that re-pushed records always carry a timestamp
 * at least as recent as the server's latest conflict timestamp.
 */
export function maxConflictServerTimestamp(response: SyncPushResponse): string | undefined {
  let max: number | undefined;
  for (const results of Object.values(response.results ?? {})) {
    for (const r of results) {
      if (r.status === "conflict" && r.server_updated_at) {
        const ms = new Date(r.server_updated_at).getTime();
        if (!isNaN(ms) && (max === undefined || ms > max)) {
          max = ms;
        }
      }
    }
  }
  return max !== undefined ? new Date(max).toISOString() : undefined;
}

/**
 * `max(serverTimestampFloor, Date.now())` expressed as an ISO-8601 string.
 *
 * Passing `serverTimestampFloor` (the `server_updated_at` returned by the last
 * conflicting push) guards against a behind-the-clock local device: if the
 * local clock is earlier than the server's timestamp the bumped value would
 * still lose the next last-write-wins check.  Taking the max ensures the
 * re-pushed version is always ≥ the server timestamp and therefore wins.
 */
export function bumpClientTimestamps(
  payload: SyncPushPayload,
  serverTimestampFloor?: string,
): SyncPushPayload {
  const nowMs = Date.now();
  const floorMs = serverTimestampFloor ? new Date(serverTimestampFloor).getTime() : nowMs;
  const effectiveFloorMs = Number.isFinite(floorMs) ? floorMs : nowMs;
  const now = new Date(Math.max(nowMs, effectiveFloorMs)).toISOString();
  return {
    labels: payload.labels.map((l) => ({ ...l, client_updated_at: now })),
    tasks: payload.tasks.map((t) => ({ ...t, client_updated_at: now })),
    templates: payload.templates.map((t) => ({ ...t, client_updated_at: now })),
    work_locations: payload.work_locations.map((w) => ({ ...w, client_updated_at: now })),
    time_off_entries: payload.time_off_entries.map((e) => ({ ...e, client_updated_at: now })),
    gantt_tasks: payload.gantt_tasks.map((g) => ({ ...g, client_updated_at: now })),
  };
}

/**
 * Maximum items per entity list accepted by POST /api/sync/push in a single
 * request (mirrors MAX_SYNC_PUSH_ITEMS in backend/app/schemas/sync.py).  Larger
 * payloads are split transparently by pushSyncPayload.
 */
export const MAX_SYNC_PUSH_ITEMS = 1000;

/**
 * Entity processing order for chunked pushes.  Referenced entities (labels,
 * gantt tasks) are pushed before the tasks/templates that link to them so
 * that server-side reference validation succeeds across chunk boundaries.
 * Mirrors the processing order of push_changes in the backend sync service.
 */
/** The entity list keys of a push payload (everything but the scalar flags). */
type SyncPushEntityKey = Exclude<
  keyof SyncPushPayload,
  "allow_bulk_delete" | "declared_delete_total"
>;

/** Count delete actions across every entity list in a payload. */
export function countPayloadDeletes(payload: SyncPushPayload): number {
  return PUSH_ENTITY_ORDER.reduce(
    (total, key) => total + (payload[key] ?? []).filter((item) => item.action === "delete").length,
    0,
  );
}

const PUSH_ENTITY_ORDER: readonly SyncPushEntityKey[] = [
  "labels",
  "gantt_tasks",
  "tasks",
  "templates",
  "work_locations",
  "time_off_entries",
];

function emptyPushPayload(): SyncPushPayload {
  return {
    labels: [],
    tasks: [],
    templates: [],
    work_locations: [],
    time_off_entries: [],
    gantt_tasks: [],
  };
}

/**
 * Split an oversized payload into single-entity chunks of at most
 * MAX_SYNC_PUSH_ITEMS items each, in dependency order.
 */
function chunkPushPayload(payload: SyncPushPayload): SyncPushPayload[] {
  const chunks: SyncPushPayload[] = [];
  const deleteTotal = Math.max(payload.declared_delete_total ?? 0, countPayloadDeletes(payload));
  for (const key of PUSH_ENTITY_ORDER) {
    const items = payload[key] ?? [];
    for (let i = 0; i < items.length; i += MAX_SYNC_PUSH_ITEMS) {
      const chunk = emptyPushPayload();
      // Carry the opt-in across the split, or a chunked keep-local replace
      // would be rejected by the server's bulk-delete guard.
      if (payload.allow_bulk_delete) chunk.allow_bulk_delete = true;
      // Tell every chunk how large the whole destructive batch is, so the
      // guard judges the logical push rather than this slice of it.
      if (deleteTotal > 0) chunk.declared_delete_total = deleteTotal;
      (chunk[key] as unknown[]) = items.slice(i, i + MAX_SYNC_PUSH_ITEMS);
      chunks.push(chunk);
    }
  }
  return chunks;
}

/** Concatenate the per-entity results of several push responses into one. */
function mergePushResponses(responses: SyncPushResponse[]): SyncPushResponse {
  return {
    results: {
      labels: responses.flatMap((response) => response.results?.labels ?? []),
      tasks: responses.flatMap((response) => response.results?.tasks ?? []),
      templates: responses.flatMap((response) => response.results?.templates ?? []),
      work_locations: responses.flatMap((response) => response.results?.work_locations ?? []),
      time_off_entries: responses.flatMap((response) => response.results?.time_off_entries ?? []),
      gantt_tasks: responses.flatMap((response) => response.results?.gantt_tasks ?? []),
    },
  };
}

/** A push that the server accepted. */
export interface PushSuccess {
  ok: true;
  response: SyncPushResponse;
}

/**
 * A push that did not land.
 *
 * `permanent` distinguishes "this batch will never be accepted, however many
 * times it is resent" (a validation rejection, or the bulk-delete guard) from
 * "try again later" (offline, 5xx, rate limited).  Retrying a permanent
 * failure forever is what turns one bad record into a wedged outbox: the flush
 * never succeeds, so it is never cleared, and every later change queues up
 * behind it and never reaches the server.
 */
export interface PushFailure {
  ok: false;
  status: number | null;
  permanent: boolean;
}

export type PushOutcome = PushSuccess | PushFailure;

/**
 * Whether a response status means resending the identical batch is pointless.
 *
 * 408 (timeout) and 429 (rate limited) are 4xx but explicitly retryable, and
 * 401/403 are excluded because they usually clear once the token is refreshed.
 */
function isPermanentPushFailure(status: number): boolean {
  if (status === 408 || status === 429 || status === 401 || status === 403) return false;
  return status >= 400 && status < 500;
}

async function pushSinglePayload(
  fetch: FetchFn,
  payload: SyncPushPayload,
  syncCursor?: string,
): Promise<PushOutcome> {
  try {
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(syncCursor ? { "X-Sync-Cursor": syncCursor } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        permanent: isPermanentPushFailure(response.status),
      };
    }
    const result = (await response.json()) as SyncPushResponse;
    reportTaskRejections(result);
    return { ok: true, response: result };
  } catch {
    // Network-level failure — always worth retrying.
    return { ok: false, status: null, permanent: false };
  }
}

/**
 * Call POST /api/sync/push with a pre-built payload.
 * Returns the server response, or null on network/parse failure.
 *
 * Payloads whose entity lists exceed MAX_SYNC_PUSH_ITEMS (e.g. a first-sync
 * upload of a long local history) are split into sequential requests and the
 * per-record results merged back into a single response.  If any chunk fails,
 * null is returned; chunks already applied are harmless because pushes are
 * idempotent (last-write-wins per record), so a retry re-sends everything.
 */
export async function pushSyncPayloadDetailed(
  fetch: FetchFn,
  payload: SyncPushPayload,
  syncCursor?: string,
): Promise<PushOutcome> {
  // Reference targets cannot be deleted until referring records are removed or
  // relinked. Keep this at the shared push boundary so outbox retries preserve
  // the same ordering even after several queued payloads have been merged.
  const deleteTotal = Math.max(payload.declared_delete_total ?? 0, countPayloadDeletes(payload));
  const labelDeletes = payload.labels.filter((item) => item.action === "delete");
  const hasReferringChanges = [payload.tasks, payload.templates, payload.gantt_tasks ?? []].some(
    (items) => items.length > 0,
  );
  const ganttDeletes = (payload.gantt_tasks ?? []).filter((item) => item.action === "delete");
  const deferred =
    labelDeletes.length > 0 && hasReferringChanges
      ? "labels"
      : ganttDeletes.length > 0 && payload.tasks.length > 0
        ? "gantt_tasks"
        : undefined;
  if (deferred) {
    const first = await pushSyncPayloadDetailed(
      fetch,
      {
        ...payload,
        declared_delete_total: deleteTotal,
        labels:
          deferred === "labels"
            ? payload.labels.filter((item) => item.action !== "delete")
            : payload.labels,
        gantt_tasks:
          deferred === "gantt_tasks"
            ? (payload.gantt_tasks ?? []).filter((item) => item.action !== "delete")
            : payload.gantt_tasks,
      },
      syncCursor,
    );
    if (!first.ok || countPushConflicts(first.response) > 0) return first;
    const last = await pushSyncPayloadDetailed(
      fetch,
      {
        ...emptyPushPayload(),
        allow_bulk_delete: payload.allow_bulk_delete,
        declared_delete_total: deleteTotal,
        labels: deferred === "labels" ? labelDeletes : [],
        gantt_tasks: deferred === "gantt_tasks" ? ganttDeletes : [],
      },
      syncCursor,
    );
    if (!last.ok) return last;
    return { ok: true, response: mergePushResponses([first.response, last.response]) };
  }
  const oversized = PUSH_ENTITY_ORDER.some(
    (key) => (payload[key] ?? []).length > MAX_SYNC_PUSH_ITEMS,
  );
  if (!oversized) {
    return pushSinglePayload(fetch, payload, syncCursor);
  }

  const responses: SyncPushResponse[] = [];
  for (const chunk of chunkPushPayload(payload)) {
    const outcome = await pushSinglePayload(fetch, chunk, syncCursor);
    if (!outcome.ok) return outcome;
    responses.push(outcome.response);
  }
  return { ok: true, response: mergePushResponses(responses) };
}

/** `pushSyncPayloadDetailed`, collapsed to a response or null. */
export async function pushSyncPayload(
  fetch: FetchFn,
  payload: SyncPushPayload,
  syncCursor?: string,
): Promise<SyncPushResponse | null> {
  const outcome = await pushSyncPayloadDetailed(fetch, payload, syncCursor);
  return outcome.ok ? outcome.response : null;
}

/**
 * Call GET /api/sync/pull (full pull when `since` is omitted).
 * Returns the pull response, or null on failure.
 */
export async function pullSyncData(fetch: FetchFn, since?: string): Promise<SyncPullResult | null> {
  try {
    const url = since ? `/api/sync/pull?since=${encodeURIComponent(since)}` : "/api/sync/pull";
    const response = await fetch(url);
    if (response.status === 410 && since) {
      const retry = await fetch("/api/sync/pull");
      if (!retry.ok) return null;
      return { ...((await retry.json()) as SyncPullResponse), full_resync_required: true };
    }
    if (!response.ok) return null;
    return (await response.json()) as SyncPullResponse;
  } catch {
    return null;
  }
}
