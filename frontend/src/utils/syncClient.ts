/**
 * Sync API client utilities.
 *
 * Provides typed wrappers around the backend sync endpoints
 * (GET /api/sync/status, POST /api/sync/push, GET /api/sync/pull)
 * and helpers to convert between localStorage formats and the
 * sync API wire format.
 *
 * Entities synced: tasks, templates, labels, work locations,
 * time-off entries, gantt tasks, and user preferences.
 */

import { dayjs } from "@/utils/dateTimeUtils";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import type { WorkLocationEntry } from "@/types/workLocation";
import { isValidRawGanttTask, type RawGanttTask } from "@/types/gantt";
import { GANTT_STORAGE_KEY } from "@/constants/storageKeys";
import {
  TIME_OFF_ENTRIES_STORAGE_KEY,
  TIME_TRACKING_STORAGE_KEYS,
  WORK_LOCATIONS_STORAGE_PREFIX,
  USER_STATE_STORAGE_KEY,
  getSyncCursorKey,
  getSyncOutboxKey,
} from "@/constants/storageKeys";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import { createTimeOffEntry } from "@/lib/timeOff/codecs";
import { isValidEntryType, isValidFlag } from "@/lib/timeOff/types";
import type { TimeOffEntry } from "@/lib/timeOff/types";

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
  start_date?: string | null;
  end_date?: string | null;
  progress?: number | null;
  dependencies?: string | null;
  notes?: string | null;
}

export interface SyncPushPayload {
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

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

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
 * Returns true when the server holds at least one syncable entity for the
 * authenticated account.
 */
export function syncStatusHasData(status: SyncStatusResponse): boolean {
  return (
    // Use != null (loose equality) to treat both null and undefined as "no data".
    // Tests and legacy callers may omit the newer fields from their mock objects.
    status.labels_updated_at != null ||
    status.tasks_updated_at != null ||
    status.templates_updated_at != null ||
    status.work_locations_updated_at != null ||
    status.time_off_entries_updated_at != null ||
    status.gantt_tasks_updated_at != null ||
    status.preferences_updated_at != null
  );
}

/**
 * Count the total number of conflict records across all entity types in a
 * push response.  Returns 0 when there are no conflicts.
 */
export function countPushConflicts(response: SyncPushResponse): number {
  return Object.values(response.results).reduce(
    (total, records) => total + records.filter((r) => r.status === "conflict").length,
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
  for (const [entityType, results] of Object.entries(response.results)) {
    conflicted[entityType] = new Set(results.filter((r) => r.status === "conflict").map((r) => r.id));
  }
  const ids = (key: string): Set<string> => conflicted[key] ?? new Set();

  // Deduplicate by natural key, keeping the last (most-recent local) entry per key.
  // The outbox merge concatenates multiple offline mutations, so the same record
  // may appear more than once.
  function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
      map.set(keyFn(item), item);
    }
    return Array.from(map.values());
  }

  return {
    labels: dedupeByKey(payload.labels.filter((l) => ids("labels").has(l.id)), (l) => l.id),
    tasks: dedupeByKey(payload.tasks.filter((t) => ids("tasks").has(t.id)), (t) => t.id),
    templates: dedupeByKey(payload.templates.filter((t) => ids("templates").has(t.id)), (t) => t.id),
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
  for (const results of Object.values(response.results)) {
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
export function bumpClientTimestamps(payload: SyncPushPayload, serverTimestampFloor?: string): SyncPushPayload {
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
 * Call POST /db/sync/push with a pre-built payload.
 * Returns the server response, or null on network/parse failure.
 */
export async function pushSyncPayload(
  fetch: FetchFn,
  payload: SyncPushPayload,
): Promise<SyncPushResponse | null> {
  try {
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return (await response.json()) as SyncPushResponse;
  } catch {
    return null;
  }
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
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (e.g., private browsing with full storage quota)
  }
}

// ---------------------------------------------------------------------------
// Local data → push payload conversion
// ---------------------------------------------------------------------------

function safeParseJsonArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseJsonObject(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

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
  const rawLabels = labelsCollection.toArray as TimeTrackingLabel[];
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
      label_id: t.label || null,
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
      label_id: t.label || null,
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

  const rawGanttTasks = ganttTasksCollection.toArray as RawGanttTask[];
  const ganttTasks: GanttTaskSyncItem[] = rawGanttTasks
    .filter(isValidRawGanttTask)
    .map((t) => ({
      id: t.id,
      action: "create" as const,
      client_updated_at: now,
      name: t.name,
      start_date: t.start,
      end_date: t.end,
      progress: t.progress ?? 0,
      dependencies: t.dependencies ?? null,
      notes: t.notes ?? null,
    }));

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

function syncItemsToTimeOffEntries(items: TimeOffEntrySyncRead[]): TimeOffEntry[] {
  return items
    .filter((item) => {
      if (item.deleted_at !== null) return false;
      if (item.entry_kind === "date") return item.date != null;
      if (item.entry_kind === "range") return item.start_date != null && item.end_date != null;
      if (item.entry_kind === "weekly") return item.weekday != null;
      return false;
    })
    .map((item) =>
      createTimeOffEntry({
        id: item.entry_id,
        entryKind: item.entry_kind,
        date: item.entry_kind === "date" ? item.date! : undefined,
        start: item.entry_kind === "range" ? item.start_date! : undefined,
        end: item.entry_kind === "range" ? item.end_date! : undefined,
        weekday: item.entry_kind === "weekly" ? item.weekday! : undefined,
        entryType: isValidEntryType(item.entry_type) ? item.entry_type : "other",
        entryFlag: isValidFlag(item.entry_flag) ? item.entry_flag : "full_day",
        note: item.note,
      } as Parameters<typeof createTimeOffEntry>[0]),
    );
}

/**
 * Build the payload for the "keep-local" conflict resolution path.
 *
 * Combines the local push payload (all local records as `action: "create"`) with
 * delete entries for any server-side records that do not exist locally, so that
 * the server ends up holding exactly what the local device has.
 */
export function buildKeepLocalReplacePayload(
  localPayload: SyncPushPayload,
  serverData: SyncPullResponse,
): SyncPushPayload {
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
    labels: [...localPayload.labels, ...deleteLabels],
    tasks: [...localPayload.tasks, ...deleteTasks],
    templates: [...localPayload.templates, ...deleteTemplates],
    work_locations: [...localPayload.work_locations, ...deleteWorkLocations],
    time_off_entries: [...localPayload.time_off_entries, ...deleteTimeOffEntries],
    gantt_tasks: [...(localPayload.gantt_tasks ?? []), ...deleteGanttTasks],
  };
}

// ---------------------------------------------------------------------------
// Pull response → localStorage conversion
// ---------------------------------------------------------------------------

/**
 * Convert a UTC ISO-8601 datetime string to a local-time string in the format
 * "YYYY-MM-DDTHH:mm", matching the format used by the task storage layer.
 */
function utcIsoToLocalTime(utcIso: string): string {
  return dayjs(utcIso).format("YYYY-MM-DDTHH:mm");
}

/**
 * Write a full SyncPullResponse into localStorage, replacing any existing
 * syncable data. Developer options are left untouched.
 *
 * Soft-deleted records (deleted_at !== null) are excluded from the local store.
 */
export function applySyncPullResponse(data: SyncPullResponse): TimeOffEntry[] {
  // Labels
  const localLabels = data.labels
    .filter((l) => l.deleted_at === null)
    .map((l) => ({ id: l.id, name: l.name, color: l.color }));
  localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.labels, JSON.stringify(localLabels));

  // Tasks — convert UTC datetime strings to local "YYYY-MM-DDTHH:mm"
  const localTasks = data.tasks
    .filter((t) => t.deleted_at === null)
    .map((t) => {
      const task: StoredTimeTrackingTask = {
        id: t.id,
        text: t.text,
        label: t.label_id ?? "",
        startTime: utcIsoToLocalTime(t.start_time),
        stopTime: t.stop_time ? utcIsoToLocalTime(t.stop_time) : undefined,
      };
      if (t.includes_break) task.includesBreak = true;
      return task;
    });
  localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(localTasks));

  // Templates — convert "HH:mm:ss" to "HH:mm"
  const localTemplates = data.templates
    .filter((t) => t.deleted_at === null)
    .map((t) => ({
      id: t.id,
      text: t.text,
      label: t.label_id ?? "",
      start: t.start_time.slice(0, 5),
      stop: t.stop_time.slice(0, 5),
    }));
  localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.templates, JSON.stringify(localTemplates));

  // Work locations — group per year into the per-year localStorage format.
  //
  // ⚠️ Data-loss note: The backend sync schema only stores `country_code` and
  // `label`; it does not persist the local `location` type ("home"/"office"/
  // "other"). When restoring from the server, all entries are written with
  // `location: "other"` as a safe default. The home/office distinction visible
  // in the UI will be lost for any work-location entry that was originally
  // synced from local data. This is a known temporary limitation of the sync
  // schema (see docs/local-first-sync-flow.md §Data Scope).
  // Clear all existing work-location keys before writing pulled data so that
  // years not present in the server response (e.g. all entries were deleted)
  // don't leave stale records behind.
  const existingWlKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(WORK_LOCATIONS_STORAGE_PREFIX)) existingWlKeys.push(key);
  }
  for (const key of existingWlKeys) {
    localStorage.removeItem(key);
  }

  const byYear: Record<string, Record<string, unknown>> = {};
  for (const wl of data.work_locations) {
    if (wl.deleted_at !== null) continue;
    const year = wl.date.slice(0, 4);
    if (!byYear[year]) byYear[year] = {};
    byYear[year][wl.date] = {
      location: "other" as const,
      countryCode: wl.country_code,
      ...(wl.label ? { label: wl.label } : {}),
    };
  }
  for (const [year, yearData] of Object.entries(byYear)) {
    localStorage.setItem(`${WORK_LOCATIONS_STORAGE_PREFIX}${year}`, JSON.stringify(yearData));
  }

  const entries = syncItemsToTimeOffEntries(data.time_off_entries ?? []);
  if (entries.length > 0) {
    localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
  } else {
    localStorage.removeItem(TIME_OFF_ENTRIES_STORAGE_KEY);
  }

  // Gantt tasks — replace all local tasks with the server state.
  const localGanttTasks: RawGanttTask[] = (data.gantt_tasks ?? [])
    .filter((g) => g.deleted_at === null)
    .map((g) => ({
      id: g.id,
      name: g.name,
      start: g.start_date,
      end: g.end_date,
      progress: g.progress,
      ...(g.dependencies ? { dependencies: g.dependencies } : {}),
      ...(g.notes ? { notes: g.notes } : {}),
    }));
  localStorage.setItem(GANTT_STORAGE_KEY, JSON.stringify(localGanttTasks));

  return entries;
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
    console.error("Failed to read sync outbox from localStorage:", err);
    return [];
  }
}

/**
 * Append a single change payload to the outbox queue stored in localStorage.
 * Called when an immediate push fails (e.g. offline).
 *
 * Note: entries are not coalesced — each failed write is stored as a separate
 * item.  Rapid offline mutations to the same record produce multiple entries,
 * all of which are merged and sent together in the next flush.  The backend
 * uses last-write-wins per record ID, so only the latest entry for a given ID
 * takes effect.  If outbox size ever becomes a concern, coalescing by ID could
 * be added here.
 */
export function appendToSyncOutbox(userId: string, change: SyncPushPayload): void {
  try {
    const outbox = readSyncOutbox(userId);
    outbox.push(change);
    localStorage.setItem(getSyncOutboxKey(userId), JSON.stringify(outbox));
  } catch {
    // Ignore storage errors (e.g., quota exceeded in private browsing)
  }
}

/**
 * Clear the outbox queue for the given user. Call after a successful flush.
 */
export function clearSyncOutbox(userId: string): void {
  localStorage.removeItem(getSyncOutboxKey(userId));
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
 * caller must invoke the returned `commit` function to clear the outbox.  If
 * the push fails the outbox is left intact and will be retried on the next
 * flush cycle.
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
  for (const payload of outbox) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    merged.labels.push(...(Array.isArray(payload.labels) ? payload.labels : []));
    merged.tasks.push(...(Array.isArray(payload.tasks) ? payload.tasks : []));
    merged.templates.push(...(Array.isArray(payload.templates) ? payload.templates : []));
    merged.work_locations.push(...(Array.isArray(payload.work_locations) ? payload.work_locations : []));
    merged.time_off_entries.push(...(Array.isArray(payload.time_off_entries) ? payload.time_off_entries : []));
    merged.gantt_tasks.push(...(Array.isArray(payload.gantt_tasks) ? payload.gantt_tasks : []));
  }
  return { merged, commit: () => clearSyncOutbox(userId) };
}

// ---------------------------------------------------------------------------
// Incremental pull — merge server changes into existing localStorage data
// ---------------------------------------------------------------------------

/**
 * Dispatch a synthetic StorageEvent on `window` so that same-tab
 * `useLocalStorage` instances watching the given key pick up the new value.
 */
function notifyLocalStorageChange(key: string, newValue: string, oldValue: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue,
        oldValue,
        storageArea: window.localStorage,
      }),
    );
  } catch {
    // Ignore dispatch errors (e.g., in environments without StorageEvent)
  }
}

/**
 * Write `value` to `localStorage[key]` and notify same-tab `useLocalStorage`
 * instances via a synthetic storage event.
 */
function setItemWithNotify(key: string, value: string): void {
  try {
    const oldValue = localStorage.getItem(key);
    localStorage.setItem(key, value);
    notifyLocalStorageChange(key, value, oldValue);
  } catch (err) {
    // Log and ignore storage write/read errors (e.g., quota exceeded, storage disabled)
    // so incremental sync fails gracefully instead of crashing callers.
    console.error("setItemWithNotify: failed to write localStorage key:", key, err);
  }
}

/**
 * Apply an incremental SyncPullResponse (i.e. a pull with `since=<cursor>`)
 * to localStorage, merging with existing data rather than replacing it.
 *
 * - Records present in the pull with `deleted_at === null` are upserted.
 * - Records with `deleted_at !== null` are removed from localStorage.
 * - Synthetic StorageEvents are dispatched so that same-tab `useLocalStorage`
 *   instances update their React state immediately.
 *
 * @returns The merged time-off entries (for the caller to pass to
 *   EventStoreContext's `replaceEntries`).
 */
export function applyIncrementalSyncPullResponse(
  data: SyncPullResponse,
  currentTimeOffEntries: TimeOffEntry[],
): TimeOffEntry[] {
  // --- Labels ---
  const existingLabels = safeParseJsonArray(TIME_TRACKING_STORAGE_KEYS.labels) as Array<{
    id: string;
    name: string;
    color: string;
  }>;
  const labelMap = new Map(existingLabels.map((l) => [l.id, l]));
  for (const l of data.labels) {
    if (l.deleted_at === null) {
      labelMap.set(l.id, { id: l.id, name: l.name, color: l.color });
    } else {
      labelMap.delete(l.id);
    }
  }
  const mergedLabels = JSON.stringify(Array.from(labelMap.values()));
  setItemWithNotify(TIME_TRACKING_STORAGE_KEYS.labels, mergedLabels);

  // --- Tasks ---
  type StoredTask = {
    id: string;
    text: string;
    label: string;
    startTime: string;
    stopTime?: string | null;
    includesBreak?: boolean;
  };
  const existingTasks = safeParseJsonArray(TIME_TRACKING_STORAGE_KEYS.tasks) as StoredTask[];
  const taskMap = new Map(existingTasks.map((t) => [t.id, t]));
  for (const t of data.tasks) {
    if (t.deleted_at === null) {
      taskMap.set(t.id, {
        id: t.id,
        text: t.text,
        label: t.label_id ?? "",
        startTime: utcIsoToLocalTime(t.start_time),
        stopTime: t.stop_time ? utcIsoToLocalTime(t.stop_time) : undefined,
        ...(t.includes_break ? { includesBreak: true } : {}),
      });
    } else {
      taskMap.delete(t.id);
    }
  }
  const mergedTasks = JSON.stringify(Array.from(taskMap.values()));
  setItemWithNotify(TIME_TRACKING_STORAGE_KEYS.tasks, mergedTasks);

  // --- Templates ---
  type StoredTemplate = { id: string; text: string; label: string; start: string; stop: string };
  const existingTemplates = safeParseJsonArray(
    TIME_TRACKING_STORAGE_KEYS.templates,
  ) as StoredTemplate[];
  const templateMap = new Map(existingTemplates.map((t) => [t.id, t]));
  for (const t of data.templates) {
    if (t.deleted_at === null) {
      templateMap.set(t.id, {
        id: t.id,
        text: t.text,
        label: t.label_id ?? "",
        start: t.start_time.slice(0, 5),
        stop: t.stop_time.slice(0, 5),
      });
    } else {
      templateMap.delete(t.id);
    }
  }
  const mergedTemplates = JSON.stringify(Array.from(templateMap.values()));
  setItemWithNotify(TIME_TRACKING_STORAGE_KEYS.templates, mergedTemplates);

  // --- Work locations: collect keys to update ---
  const affectedYears = new Set<string>();
  for (const wl of data.work_locations) {
    affectedYears.add(wl.date.slice(0, 4));
  }
  for (const year of affectedYears) {
    const key = `${WORK_LOCATIONS_STORAGE_PREFIX}${year}`;
    const existing = safeParseJsonObject(key) as Record<string, unknown>;
    for (const wl of data.work_locations) {
      if (wl.date.slice(0, 4) !== year) continue;
      if (wl.deleted_at === null) {
        existing[wl.date] = {
          location: "other" as const,
          countryCode: wl.country_code,
          ...(wl.label ? { label: wl.label } : {}),
        };
      } else {
        delete existing[wl.date];
      }
    }
    const mergedWl = JSON.stringify(existing);
    setItemWithNotify(key, mergedWl);
  }

  // --- Gantt tasks ---
  const existingGanttTasks = safeParseJsonArray(GANTT_STORAGE_KEY) as RawGanttTask[];
  const ganttMap = new Map(existingGanttTasks.map((g) => [g.id, g]));
  for (const g of data.gantt_tasks ?? []) {
    if (g.deleted_at === null) {
      ganttMap.set(g.id, {
        id: g.id,
        name: g.name,
        start: g.start_date,
        end: g.end_date,
        progress: g.progress,
        ...(g.dependencies ? { dependencies: g.dependencies } : {}),
        ...(g.notes ? { notes: g.notes } : {}),
      });
    } else {
      ganttMap.delete(g.id);
    }
  }
  setItemWithNotify(GANTT_STORAGE_KEY, JSON.stringify(Array.from(ganttMap.values())));

  // --- Time-off: merge into current EventStore entries ---
  const deletedIds = new Set(
    (data.time_off_entries ?? [])
      .filter((e) => e.deleted_at !== null)
      .map((e) => e.entry_id),
  );
  const newEntries = syncItemsToTimeOffEntries(data.time_off_entries ?? []);

  const byId = new Map(
    currentTimeOffEntries.filter((e) => !deletedIds.has(e.id)).map((e) => [e.id, e]),
  );
  for (const entry of newEntries) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}
