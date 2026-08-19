/**
 * Sync API client utilities.
 *
 * Provides typed wrappers around the backend sync endpoints
 * (GET /api/sync/status, POST /api/sync/push, GET /api/sync/pull).
 *
 * Fresh-launch architecture:
 * - Sync-managed domains live in TanStack DB collections.
 * - User preferences, sync cursor, and outbox remain in localStorage.
 *
 */

import { dayjs } from "@/utils/dateTimeUtils";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { Label } from "@/components/timeTracking/constants";
import type { WorkLocationEntry } from "@/types/workLocation";
import { isValidRawGanttTask, type RawGanttTask } from "@/types/gantt";
import {
  USER_STATE_STORAGE_KEY,
  getSyncCursorKey,
  getSyncOutboxKey,
  getSyncQuarantineKey,
} from "@/constants/storageKeys";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// TypeScript representations of the backend sync wire schemas
// ---------------------------------------------------------------------------

export type SyncAction = "create" | "update" | "delete";

export interface LabelSyncItem {
  id: string;
  action: SyncAction;
  client_updated_at: string;
  name?: string | null;
  color?: string | null;
}

export interface TaskSyncItem {
  id: string;
  action: SyncAction;
  client_updated_at: string;
  label_id?: string | null;
  gantt_task_id?: string | null;
  text?: string | null;
  start_time?: string | null;
  stop_time?: string | null;
  includes_break?: boolean | null;
}

export interface TemplateSyncItem {
  id: string;
  action: SyncAction;
  client_updated_at: string;
  label_id?: string | null;
  text?: string | null;
  start_time?: string | null;
  stop_time?: string | null;
}

export interface WorkLocationSyncItem {
  date: string;
  action: SyncAction;
  client_updated_at: string;
  country_code?: string | null;
  label?: string | null;
}

export interface TimeOffEntrySyncItem {
  id: string;
  action: SyncAction;
  client_updated_at: string;
  entry_kind?: "date" | "range" | "weekly" | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  weekday?: number | null;
  entry_type?: string | null;
  entry_flag?: string | null;
  note?: string | null;
}

export interface GanttTaskSyncItem {
  id: string;
  action: SyncAction;
  client_updated_at: string;
  name?: string | null;
  label_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  progress?: number | null;
  dependencies?: string | null;
  notes?: string | null;
}

export interface SyncPushPayload {
  /**
   * Explicit acknowledgement that this batch is meant to remove most of the
   * account's records.  Only the user-confirmed "keep local data" replace sets
   * it; without it the server refuses batches that would wipe the account (see
   * `BULK_DELETE_MIN_RECORDS` in the backend sync service).
   */
  allow_bulk_delete?: boolean;
  /**
   * Total delete actions in the logical push this request belongs to.
   *
   * Set automatically when a payload is split across requests. Each chunk is
   * its own server transaction, so without this the bulk-delete guard sees
   * only its own slice and lets the first chunk of a destructive batch commit
   * before refusing a later one. Never set by hand.
   */
  declared_delete_total?: number;
  labels: LabelSyncItem[];
  tasks: TaskSyncItem[];
  templates: TemplateSyncItem[];
  work_locations: WorkLocationSyncItem[];
  time_off_entries: TimeOffEntrySyncItem[];
  gantt_tasks: GanttTaskSyncItem[];
}

export interface SyncRecordResult {
  id: string;
  status: "ok" | "conflict";
  server_updated_at?: string | null;
  conflict_reason?: string | null;
}

export interface SyncPushResponse {
  results: Record<string, SyncRecordResult[]>;
}

export interface LabelSyncRead {
  id: string;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskSyncRead {
  id: string;
  user_id: number;
  label_id: string | null;
  gantt_task_id: string | null;
  text: string;
  start_time: string;
  stop_time: string | null;
  includes_break: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TemplateSyncRead {
  id: string;
  user_id: number;
  label_id: string | null;
  text: string;
  start_time: string;
  stop_time: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkLocationSyncRead {
  id: number;
  user_id: number;
  date: string;
  country_code: string;
  label: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TimeOffEntrySyncRead {
  id: number;
  entry_id: string;
  user_id: number;
  entry_kind: "date" | "range" | "weekly";
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  weekday: number | null;
  entry_type: string;
  entry_flag: string;
  note: string | null;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GanttTaskSyncRead {
  id: string;
  user_id: number;
  name: string;
  label_id: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  dependencies: string | null;
  notes: string | null;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SyncPullResponse {
  labels: LabelSyncRead[];
  tasks: TaskSyncRead[];
  templates: TemplateSyncRead[];
  work_locations: WorkLocationSyncRead[];
  time_off_entries: TimeOffEntrySyncRead[];
  gantt_tasks: GanttTaskSyncRead[];
  server_timestamp: string;
}

export interface SyncStatusResponse {
  labels_updated_at: string | null;
  tasks_updated_at: string | null;
  templates_updated_at: string | null;
  work_locations_updated_at: string | null;
  time_off_entries_updated_at: string | null;
  gantt_tasks_updated_at: string | null;
  preferences_updated_at: string | null;
  server_timestamp: string;
}

// ---------------------------------------------------------------------------
// Fetch wrappers
// ---------------------------------------------------------------------------

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Call GET /db/sync/status.
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
function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}

/**
 * Count the total number of conflict records across all entity types in a
 * push response.  Returns 0 when there are no conflicts.
 */
export function countPushConflicts(response: SyncPushResponse): number {
  return Object.values(response.results ?? {}).reduce(
    (total, records) =>
      total + (records ?? []).filter((r) => r.status === "conflict").length,
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
 * request (mirrors MAX_SYNC_PUSH_ITEMS in backend/app/schemas.py).  Larger
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
    (total, key) =>
      total + (payload[key] ?? []).filter((item) => item.action === "delete").length,
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
  const deleteTotal = countPayloadDeletes(payload);
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
  const results: Record<string, SyncRecordResult[]> = {};
  for (const response of responses) {
    for (const [entityType, records] of Object.entries(response.results ?? {})) {
      (results[entityType] ??= []).push(...(records ?? []));
    }
  }
  return { results };
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
): Promise<PushOutcome> {
  try {
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        permanent: isPermanentPushFailure(response.status),
      };
    }
    return { ok: true, response: (await response.json()) as SyncPushResponse };
  } catch {
    // Network-level failure — always worth retrying.
    return { ok: false, status: null, permanent: false };
  }
}

/**
 * Call POST /db/sync/push with a pre-built payload.
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
): Promise<PushOutcome> {
  const oversized = PUSH_ENTITY_ORDER.some(
    (key) => (payload[key] ?? []).length > MAX_SYNC_PUSH_ITEMS,
  );
  if (!oversized) {
    return pushSinglePayload(fetch, payload);
  }

  const responses: SyncPushResponse[] = [];
  for (const chunk of chunkPushPayload(payload)) {
    const outcome = await pushSinglePayload(fetch, chunk);
    if (!outcome.ok) return outcome;
    responses.push(outcome.response);
  }
  return { ok: true, response: mergePushResponses(responses) };
}

/** `pushSyncPayloadDetailed`, collapsed to a response or null. */
export async function pushSyncPayload(
  fetch: FetchFn,
  payload: SyncPushPayload,
): Promise<SyncPushResponse | null> {
  const outcome = await pushSyncPayloadDetailed(fetch, payload);
  return outcome.ok ? outcome.response : null;
}

/**
 * Call GET /db/sync/pull (full pull when `since` is omitted).
 * Returns the pull response, or null on failure.
 */
export async function pullSyncData(
  fetch: FetchFn,
  since?: string,
): Promise<SyncPullResponse | null> {
  try {
    const url = since ? `/api/sync/pull?since=${encodeURIComponent(since)}` : "/api/sync/pull";
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as SyncPullResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Preferences sync helpers
// ---------------------------------------------------------------------------

/** Shape returned by GET /db/preferences */
export interface PreferencesResponse {
  user_id: number;
  data: Record<string, unknown>;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Call GET /db/preferences.
 * Returns null if the request fails or returns 404 (no preferences stored yet).
 */
export async function fetchPreferences(fetch: FetchFn): Promise<PreferencesResponse | null> {
  try {
    const response = await fetch("/api/preferences");
    if (!response.ok) return null;
    const body: unknown = await response.json();
    // The endpoint returns null (JSON null) when no preferences exist yet.
    if (body === null || typeof body !== "object") return null;
    return body as PreferencesResponse;
  } catch {
    return null;
  }
}

/**
 * Call PUT /db/preferences to push local user state to the server.
 * Returns true on success, false on failure.
 */
export async function pushPreferences(
  fetch: FetchFn,
  data: Record<string, unknown>,
  clientUpdatedAt: string,
): Promise<boolean> {
  try {
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, client_updated_at: clientUpdatedAt }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Read the current worktime_user_state from localStorage and return it as a
 * preferences payload suitable for pushPreferences().
 * Returns null if there is no local user state to push.
 */
export function buildLocalPreferencesPayload(): {
  data: Record<string, unknown>;
  clientUpdatedAt: string;
} | null {
  try {
    const raw = localStorage.getItem(USER_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const stored = parsed as Record<string, unknown>;
    const storedTimestamp =
      typeof stored._updatedAt === "string" ? stored._updatedAt : dayjs().toISOString();
    return {
      data: stored,
      clientUpdatedAt: storedTimestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Write pulled preferences data to worktime_user_state in localStorage,
 * replacing any existing value.
 */
export function applyPreferencesPull(data: Record<string, unknown>): void {
  try {
    const serialized = JSON.stringify(data);
    const oldValue = localStorage.getItem(USER_STATE_STORAGE_KEY);
    localStorage.setItem(USER_STATE_STORAGE_KEY, serialized);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: USER_STATE_STORAGE_KEY,
          newValue: serialized,
          oldValue,
          storageArea: localStorage,
        }),
      );
    }
  } catch {
    // Ignore storage errors (e.g., private browsing with full storage quota)
  }
}

function parseTimestampMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Reconcile local and server preferences by last-write-wins on the stored
 * `_updatedAt` timestamp, and return the winning timestamp.
 *
 * Preferences are one opaque blob rather than per-field records, so this is a
 * whole-document comparison: the newer side replaces the older one outright.
 * Used by both the first-sync flow and every ongoing sync cycle so a device
 * that signs in with newer local settings does not silently lose them to an
 * older server copy (and vice versa).
 */
export async function reconcilePreferences(fetch: FetchFn): Promise<string | null> {
  const [localPrefs, serverPrefs] = await Promise.all([
    Promise.resolve(buildLocalPreferencesPayload()),
    fetchPreferences(fetch),
  ]);

  const localTimestamp = localPrefs?.clientUpdatedAt ?? null;
  const serverTimestamp = serverPrefs?.client_updated_at ?? null;

  const localMs = parseTimestampMs(localTimestamp);
  const serverMs = parseTimestampMs(serverTimestamp);

  if (localPrefs && (!serverPrefs || localMs > serverMs)) {
    const pushed = await pushPreferences(fetch, localPrefs.data, localPrefs.clientUpdatedAt);
    return pushed ? localPrefs.clientUpdatedAt : serverTimestamp;
  }

  if (serverPrefs && (!localPrefs || serverMs > localMs)) {
    applyPreferencesPull(serverPrefs.data);
    return serverPrefs.client_updated_at;
  }

  return localTimestamp ?? serverTimestamp;
}

// ---------------------------------------------------------------------------
// Collection-backed local data -> push payload conversion
// ---------------------------------------------------------------------------

/**
 * Convert a local time string ("YYYY-MM-DDTHH:mm") to a UTC ISO-8601 string
 * suitable for sending to the backend. The local string is parsed as browser
 * local time (matching how it was written) and then serialized to UTC.
 * Returns null if the string cannot be parsed as a valid date.
 */
function localTimeToUtcIso(localTime: string): string | null {
  const parsed = dayjs(localTime);
  if (!parsed.isValid()) return null;
  return parsed.toISOString();
}

/**
 * Build a SyncPushPayload from the current collection-backed local state.
 *
 * Entities included: labels, tasks, templates, work locations, and time-off
 * entries. All records are sent with `action: "create"` and a
 * `client_updated_at` of `now()` — this is correct for a first-ever push
 * where there is guaranteed to be no conflicting server state.
 */
export function buildLocalSyncPushPayload(): SyncPushPayload {
  const now = dayjs().toISOString();

  // Labels — filter out rows with missing/invalid required fields so that a
  // single corrupted label cannot cause the entire first-sync push to fail.
  const rawLabels = labelsCollection.toArray as Label[];
  const labels: LabelSyncItem[] = rawLabels
    .filter(
      (l) =>
        l &&
        typeof l.id === "string" &&
        typeof l.name === "string" &&
        // color is required by the backend for create actions
        typeof l.color === "string",
    )
    .map((l) => ({
      id: l.id,
      action: "create",
      client_updated_at: now,
      name: l.name,
      color: l.color,
    }));
  const keptLabelIds = new Set(labels.map((l) => l.id));

  // Gantt tasks — computed before tasks/templates so their id set is available
  // to null out dangling `gantt_task_id` references below.
  const rawGanttTasks = ganttTasksCollection.toArray as RawGanttTask[];
  const ganttTasks: GanttTaskSyncItem[] = rawGanttTasks.filter(isValidRawGanttTask).map((t) => ({
    id: t.id,
    action: "create" as const,
    client_updated_at: now,
    name: t.name,
    label_id: t.label && keptLabelIds.has(t.label) ? t.label : null,
    start_date: t.start,
    end_date: t.end,
    progress: t.progress ?? 0,
    dependencies: t.dependencies ?? null,
    notes: t.notes ?? null,
  }));
  const keptGanttIds = new Set(ganttTasks.map((g) => g.id));

  // Tasks
  const rawTasks = tasksCollection.toArray as StoredTimeTrackingTask[];
  const tasks: TaskSyncItem[] = rawTasks
    .filter((t) => {
      if (!t || typeof t.id !== "string" || typeof t.startTime !== "string") return false;
      // Exclude soft-deleted tasks (e.g. rows carrying a deleted_at marker from a prior sync).
      if ((t as unknown as Record<string, unknown>)["deleted_at"] != null) return false;
      // Exclude tasks with timestamps that cannot be parsed — a single bad row
      // must not abort the whole sync.
      if (localTimeToUtcIso(t.startTime) === null) return false;
      if (t.stopTime != null && localTimeToUtcIso(t.stopTime) === null) return false;
      return true;
    })
    .map((t) => ({
      id: t.id,
      action: "create" as const,
      client_updated_at: now,
      // Null out references to labels/gantt tasks that were themselves
      // dropped by the filters above, so a dangling reference cannot 400 the
      // whole batch server-side (see backend `_validate_task_label_reference`
      // / `_validate_task_gantt_reference`).
      label_id: t.label && keptLabelIds.has(t.label) ? t.label : null,
      gantt_task_id: t.ganttTaskId && keptGanttIds.has(t.ganttTaskId) ? t.ganttTaskId : null,
      text: t.text,
      start_time: localTimeToUtcIso(t.startTime)!,
      stop_time: t.stopTime ? localTimeToUtcIso(t.stopTime) : null,
      includes_break: t.includesBreak ?? false,
    }));

  // Templates — filter out rows missing required fields (text, start, stop) so
  // that a single malformed template cannot cause the entire push to fail.
  // Strict time validation: hours 00-23, minutes 00-59.
  const isValidTime = (time: string): boolean => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
    const parts = time.split(":").map(Number);
    const h = parts[0];
    const m = parts[1];
    return h !== undefined && h >= 0 && h <= 23 && m !== undefined && m >= 0 && m <= 59;
  };
  const rawTemplates = templatesCollection.toArray as TimeTrackingTemplate[];
  const templates: TemplateSyncItem[] = rawTemplates
    .filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.text === "string" &&
        t.text.trim().length > 0 &&
        typeof t.start === "string" &&
        isValidTime(t.start) &&
        typeof t.stop === "string" &&
        isValidTime(t.stop),
    )
    .map((t) => ({
      id: t.id,
      action: "create",
      client_updated_at: now,
      label_id: t.label && keptLabelIds.has(t.label) ? t.label : null,
      text: t.text,
      // Local format is "HH:mm"; server expects "HH:mm:ss"
      start_time: `${t.start}:00`,
      stop_time: `${t.stop}:00`,
    }));

  // Work locations — validate date keys before pushing.
  const isValidDateKey = (dateStr: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return false;
    // Verify the date round-trips correctly (e.g., "2026-02-30" would parse but not round-trip).
    const yyyy = parsed.getUTCFullYear();
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}` === dateStr;
  };
  const rawWorkLocations = workLocationsCollection.toArray as WorkLocationEntry[];
  const workLocations: WorkLocationSyncItem[] = rawWorkLocations
    .filter(
      (entry) =>
        entry &&
        typeof entry.date === "string" &&
        isValidDateKey(entry.date) &&
        typeof entry.countryCode === "string",
    )
    .map((entry) => ({
      date: entry.date,
      action: "create",
      client_updated_at: now,
      country_code: entry.countryCode,
      label: entry.label ?? null,
    }));

  const localTimeOffEntries = (timeOffCollection.toArray as TimeOffEntry[]).filter(
    (entry) => entry && typeof entry.id === "string",
  );

  const timeOffEntries = timeOffEntriesToSyncItems(localTimeOffEntries, now);

  return {
    labels,
    tasks,
    templates,
    work_locations: workLocations,
    time_off_entries: timeOffEntries,
    gantt_tasks: ganttTasks,
  };
}

// ---------------------------------------------------------------------------
// Time-off conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert canonical time-off entries into the backend's structured sync payload.
 */
export function timeOffEntriesToSyncItems(
  entries: TimeOffEntry[],
  clientUpdatedAt: string,
): TimeOffEntrySyncItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    action: "create",
    client_updated_at: clientUpdatedAt,
    entry_kind: entry.entryKind,
    date: entry.entryKind === "date" ? entry.date : null,
    start_date: entry.entryKind === "range" ? entry.start : null,
    end_date: entry.entryKind === "range" ? entry.end : null,
    weekday: entry.entryKind === "weekly" ? entry.weekday : null,
    entry_type: entry.entryType,
    entry_flag: entry.entryFlag,
    note: entry.note,
  }));
}

/** True when a push payload carries no records of any entity type. */
export function isEmptyPushPayload(payload: SyncPushPayload): boolean {
  return (
    payload.labels.length === 0 &&
    payload.tasks.length === 0 &&
    payload.templates.length === 0 &&
    payload.work_locations.length === 0 &&
    (payload.time_off_entries ?? []).length === 0 &&
    (payload.gantt_tasks ?? []).length === 0
  );
}

/**
 * Thrown by `buildKeepLocalReplacePayload` when the local side is completely
 * empty, so "make the server match local" would mean "delete everything".
 */
export class EmptyLocalReplaceError extends Error {
  constructor() {
    super("refusing to build a keep-local replace payload from empty local data");
    this.name = "EmptyLocalReplaceError";
  }
}

/**
 * Build the payload for the "keep-local" conflict resolution path.
 *
 * Combines the local push payload (all local records as `action: "create"`) with
 * delete entries for any server-side records that do not exist locally, so that
 * the server ends up holding exactly what the local device has.
 *
 * Throws `EmptyLocalReplaceError` when `localPayload` holds nothing at all.
 * "Keep my local data" over an empty local snapshot only ever produces a batch
 * of deletes, and the overwhelmingly likely cause is that the local
 * collections had not finished loading rather than that the user really wants
 * their account emptied — the two are indistinguishable from the data alone,
 * so the destructive reading is refused.  The payload also carries
 * `allow_bulk_delete` so the server lets a genuine, user-confirmed replace
 * through its own guard (see `push_changes` in the backend sync service).
 */
export function buildKeepLocalReplacePayload(
  localPayload: SyncPushPayload,
  serverData: SyncPullResponse,
): SyncPushPayload {
  if (isEmptyPushPayload(localPayload)) {
    throw new EmptyLocalReplaceError();
  }
  const now = dayjs().toISOString();

  const localLabelIds = new Set(localPayload.labels.map((l) => l.id));
  const localTaskIds = new Set(localPayload.tasks.map((t) => t.id));
  const localTemplateIds = new Set(localPayload.templates.map((t) => t.id));
  const localWorkLocationDates = new Set(localPayload.work_locations.map((wl) => wl.date));
  const localTimeOffIds = new Set((localPayload.time_off_entries ?? []).map((e) => e.id));
  const localGanttIds = new Set((localPayload.gantt_tasks ?? []).map((g) => g.id));

  const deleteLabels: LabelSyncItem[] = serverData.labels
    .filter((l) => !localLabelIds.has(l.id) && l.deleted_at === null)
    .map((l) => ({ id: l.id, action: "delete", client_updated_at: now }));

  const deleteTasks: TaskSyncItem[] = serverData.tasks
    .filter((t) => !localTaskIds.has(t.id) && t.deleted_at === null)
    .map((t) => ({ id: t.id, action: "delete", client_updated_at: now }));

  const deleteTemplates: TemplateSyncItem[] = serverData.templates
    .filter((t) => !localTemplateIds.has(t.id) && t.deleted_at === null)
    .map((t) => ({ id: t.id, action: "delete", client_updated_at: now }));

  const deleteWorkLocations: WorkLocationSyncItem[] = serverData.work_locations
    .filter((wl) => !localWorkLocationDates.has(wl.date) && wl.deleted_at === null)
    .map((wl) => ({ date: wl.date, action: "delete", client_updated_at: now }));

  const deleteTimeOffEntries: TimeOffEntrySyncItem[] = (serverData.time_off_entries ?? [])
    .filter((e) => !localTimeOffIds.has(e.entry_id) && e.deleted_at === null)
    .map((e) => ({ id: e.entry_id, action: "delete", client_updated_at: now }));

  const deleteGanttTasks: GanttTaskSyncItem[] = (serverData.gantt_tasks ?? [])
    .filter((g) => !localGanttIds.has(g.id) && g.deleted_at === null)
    .map((g) => ({ id: g.id, action: "delete", client_updated_at: now }));

  return {
    // The user explicitly chose to replace the server's contents, so opt in to
    // the backend's bulk-delete guard for this batch only.
    allow_bulk_delete: true,
    labels: [...localPayload.labels, ...deleteLabels],
    tasks: [...localPayload.tasks, ...deleteTasks],
    templates: [...localPayload.templates, ...deleteTemplates],
    work_locations: [...localPayload.work_locations, ...deleteWorkLocations],
    time_off_entries: [...localPayload.time_off_entries, ...deleteTimeOffEntries],
    gantt_tasks: [...(localPayload.gantt_tasks ?? []), ...deleteGanttTasks],
  };
}

// ---------------------------------------------------------------------------
// Sync cursor helpers (shared between useFirstSyncFlow and useOngoingSync)
// ---------------------------------------------------------------------------

/**
 * Returns true when the given userId already has a sync cursor stored locally,
 * meaning the first-sync flow has already been completed on this device.
 */
export function hasSyncCursor(userId: string): boolean {
  return localStorage.getItem(getSyncCursorKey(userId)) !== null;
}

/**
 * Persist the server_timestamp returned by a successful push or pull as the
 * sync cursor for the given user.
 */
export function storeSyncCursor(userId: string, serverTimestamp: string): void {
  localStorage.setItem(getSyncCursorKey(userId), serverTimestamp);
}

// ---------------------------------------------------------------------------
// Outbox management (offline write queue)
// ---------------------------------------------------------------------------

function readSyncOutbox(userId: string): SyncPushPayload[] {
  try {
    const raw = localStorage.getItem(getSyncOutboxKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncPushPayload[]) : [];
  } catch (err) {
    logger.error("Failed to read sync outbox from localStorage:", err);
    return [];
  }
}

function writeSyncOutbox(userId: string, outbox: SyncPushPayload[]): void {
  localStorage.setItem(getSyncOutboxKey(userId), JSON.stringify(outbox));
}

/**
 * Append a single change payload to the outbox queue stored in localStorage.
 * Called when an immediate push fails (e.g. offline).
 *
 * Note: entries are not coalesced at append time — each failed write is
 * stored as a separate item.  Rapid offline mutations to the same record
 * produce multiple entries; dequeueAndMergeSyncOutbox coalesces them by
 * natural key (keeping the newest) before the flush is sent.
 */
export function appendToSyncOutbox(userId: string, change: SyncPushPayload): boolean {
  try {
    const outbox = readSyncOutbox(userId);
    outbox.push(change);
    writeSyncOutbox(userId, outbox);
    return true;
  } catch (err) {
    // Storage rejected the write (quota exceeded, private browsing). Report it
    // rather than swallowing: this is the only durable record that the change
    // still needs uploading, so a silent failure here means the write lives in
    // memory only while the UI keeps showing a healthy, fully-synced state.
    logger.error("Failed to append to sync outbox:", err);
    return false;
  }
}

/**
 * Clear the outbox queue for the given user. Call after a successful flush.
 */
export function clearSyncOutbox(userId: string): void {
  localStorage.removeItem(getSyncOutboxKey(userId));
}

// ---------------------------------------------------------------------------
// Quarantine (permanently rejected changes)
// ---------------------------------------------------------------------------

/** A batch the server will never accept, kept so its contents are recoverable. */
export interface QuarantinedChange {
  quarantinedAt: string;
  status: number | null;
  payload: SyncPushPayload;
}

/**
 * Cap on retained quarantine entries.  Bounded so a client stuck in a
 * rejection loop cannot fill localStorage and start failing the outbox writes
 * that everything else depends on.
 */
const MAX_QUARANTINED_CHANGES = 20;

export function readSyncQuarantine(userId: string): QuarantinedChange[] {
  try {
    const raw = localStorage.getItem(getSyncQuarantineKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuarantinedChange[]) : [];
  } catch (err) {
    logger.error("Failed to read sync quarantine from localStorage:", err);
    return [];
  }
}

/**
 * Set aside a batch the server permanently refused.
 *
 * The alternative to quarantining is one of two bad outcomes: retry it forever
 * (the outbox never drains, so every *later* change is stuck behind it and
 * never reaches the server) or drop it (the change is gone with no trace).
 * Moving it aside keeps sync flowing for everything else while preserving the
 * rejected records, so they can be inspected or re-applied rather than
 * silently lost.
 */
export function quarantineSyncChange(
  userId: string,
  payload: SyncPushPayload,
  status: number | null,
): boolean {
  try {
    const existing = readSyncQuarantine(userId);
    existing.push({ quarantinedAt: dayjs().toISOString(), status, payload });
    localStorage.setItem(
      getSyncQuarantineKey(userId),
      JSON.stringify(existing.slice(-MAX_QUARANTINED_CHANGES)),
    );
    return true;
  } catch (err) {
    // Reported rather than swallowed: the caller clears the outbox once this
    // succeeds, so a silent failure here would drop the batch from both
    // durable stores at once.
    logger.error("Failed to quarantine a rejected sync change:", err);
    return false;
  }
}

/** Number of permanently-rejected batches currently held aside. */
export function getSyncQuarantineSize(userId: string): number {
  return readSyncQuarantine(userId).length;
}

/** Discard the quarantined batches for the given user. */
export function clearSyncQuarantine(userId: string): void {
  localStorage.removeItem(getSyncQuarantineKey(userId));
}

/**
 * Return the number of pending entries in the outbox queue.
 */
export function getSyncOutboxSize(userId: string): number {
  return readSyncOutbox(userId).length;
}

/**
 * Merge all pending outbox payloads into a single SyncPushPayload ready to
 * send via pushSyncPayload().  Returns null when the outbox is empty.
 *
 * The outbox is **not** cleared by this call.  After a successful push the
 * caller must invoke the returned `commit` function to remove the dequeued
 * entries.  If the push fails the outbox is left intact and will be retried
 * on the next flush cycle.
 *
 * `commit` only removes the entries present in this snapshot (matched by
 * content, not position) rather than clearing the whole key. The outbox is
 * append-only, so any entry written by a concurrent `appendToSyncOutbox`
 * while this batch's push is in flight lands after the snapshot and survives
 * the commit instead of being silently dropped. Matching by content (rather
 * than dropping a fixed count from the front) also keeps a second, overlapping
 * flush safe — e.g. two browser tabs for the same user, which aren't
 * serialized against each other since `isFlushingRef` is in-memory per tab:
 * if tab A's commit has already removed the snapshot it dequeued, tab B's
 * later commit finds none of *its* snapshot entries still present and removes
 * nothing, rather than deleting whatever now occupies that position.
 *
 * Entries are coalesced by natural key (id, or date for work locations),
 * keeping only the newest entry per record.  This is safe because every
 * queued mutation carries the full record and the server upserts by natural
 * key, and it keeps long-offline flushes bounded by the number of *distinct*
 * records rather than the number of mutations.
 *
 * `allow_bulk_delete` is OR-combined across entries: if any queued payload
 * opted in (e.g. a "keep local" replace queued after its immediate push
 * failed — see `buildKeepLocalReplacePayload`), the merged batch carries the
 * opt-in too, and `declared_delete_total` is recomputed from the merged
 * result. Dropping either on a retry would let the server's bulk-delete guard
 * reject deletes the user already confirmed, silently leaving those records
 * (and anything they depended on being gone) back on the server.
 */
export function dequeueAndMergeSyncOutbox(
  userId: string,
): { merged: SyncPushPayload; commit: () => void } | null {
  const outbox = readSyncOutbox(userId);
  if (outbox.length === 0) return null;

  const merged: SyncPushPayload = {
    labels: [],
    tasks: [],
    templates: [],
    work_locations: [],
    time_off_entries: [],
    gantt_tasks: [],
  };
  let allowBulkDelete = false;
  for (const payload of outbox) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    merged.labels.push(...(Array.isArray(payload.labels) ? payload.labels : []));
    merged.tasks.push(...(Array.isArray(payload.tasks) ? payload.tasks : []));
    merged.templates.push(...(Array.isArray(payload.templates) ? payload.templates : []));
    merged.work_locations.push(
      ...(Array.isArray(payload.work_locations) ? payload.work_locations : []),
    );
    merged.time_off_entries.push(
      ...(Array.isArray(payload.time_off_entries) ? payload.time_off_entries : []),
    );
    merged.gantt_tasks.push(...(Array.isArray(payload.gantt_tasks) ? payload.gantt_tasks : []));
    if (payload.allow_bulk_delete) allowBulkDelete = true;
  }
  const mergedResult: SyncPushPayload = {
    labels: dedupeByKey(merged.labels, (l) => l.id),
    tasks: dedupeByKey(merged.tasks, (t) => t.id),
    templates: dedupeByKey(merged.templates, (t) => t.id),
    work_locations: dedupeByKey(merged.work_locations, (w) => w.date),
    time_off_entries: dedupeByKey(merged.time_off_entries, (e) => e.id),
    gantt_tasks: dedupeByKey(merged.gantt_tasks, (g) => g.id),
  };
  if (allowBulkDelete) {
    mergedResult.allow_bulk_delete = true;
    mergedResult.declared_delete_total = countPayloadDeletes(mergedResult);
  }
  return {
    merged: mergedResult,
    commit: () => {
      // Remove exactly the dequeued entries, matched by content rather than
      // position, so a concurrent commit (a second tab, or anything else
      // that raced this snapshot) never removes an entry it didn't dequeue.
      // Tracked as a multiset (key -> remaining count) rather than an
      // indexOf/splice scan per entry, so this stays O(n) instead of O(n*m).
      const toRemoveCounts = new Map<string, number>();
      for (const entry of outbox) {
        const key = JSON.stringify(entry);
        toRemoveCounts.set(key, (toRemoveCounts.get(key) ?? 0) + 1);
      }
      const current = readSyncOutbox(userId);
      const remaining: SyncPushPayload[] = [];
      for (const entry of current) {
        const key = JSON.stringify(entry);
        const count = toRemoveCounts.get(key);
        if (count) {
          toRemoveCounts.set(key, count - 1);
        } else {
          remaining.push(entry);
        }
      }
      try {
        writeSyncOutbox(userId, remaining);
      } catch (err) {
        // The push already succeeded. Report the failed prune rather than
        // reporting the whole flush as failed.
        logger.error("Failed to prune committed entries from the sync outbox:", err);
      }
    },
  };
}
