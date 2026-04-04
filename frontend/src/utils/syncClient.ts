/**
 * Sync API client utilities.
 *
 * Provides typed wrappers around the backend sync endpoints
 * (GET /db/sync/status, POST /db/sync/push, GET /db/sync/pull)
 * and helpers to convert between localStorage formats and the
 * sync API wire format.
 *
 * Only the entities currently synced by the backend are included:
 * tasks, templates, labels, and work locations.
 */

import { TIME_TRACKING_STORAGE_KEYS } from "../components/timeTracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "../components/timeTracking/types";
import type { TimeTrackingLabel } from "../components/timeTracking/constants";
import type { WorkLocationInfo } from "../types/workLocation";
import { WORK_LOCATIONS_STORAGE_PREFIX } from "../constants/storageKeys";

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

export interface SyncPushPayload {
  labels: LabelSyncItem[];
  tasks: TaskSyncItem[];
  templates: TemplateSyncItem[];
  work_locations: WorkLocationSyncItem[];
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

export interface SyncPullResponse {
  labels: LabelSyncRead[];
  tasks: TaskSyncRead[];
  templates: TemplateSyncRead[];
  work_locations: WorkLocationSyncRead[];
  server_timestamp: string;
}

export interface SyncStatusResponse {
  labels_updated_at: string | null;
  tasks_updated_at: string | null;
  templates_updated_at: string | null;
  work_locations_updated_at: string | null;
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
    const response = await fetch("/db/sync/status");
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
    status.labels_updated_at !== null ||
    status.tasks_updated_at !== null ||
    status.templates_updated_at !== null ||
    status.work_locations_updated_at !== null
  );
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
    const response = await fetch("/db/sync/push", {
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
    const url = since ? `/db/sync/pull?since=${encodeURIComponent(since)}` : "/db/sync/pull";
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as SyncPullResponse;
  } catch {
    return null;
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
  const parsed = new Date(localTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Build a SyncPushPayload from the current localStorage contents.
 *
 * Only entities currently supported by the sync API are included:
 * labels, tasks, templates, and work locations.
 *
 * All records are sent with `action: "create"` and a `client_updated_at`
 * of `now()` — this is correct for a first-ever push where there is
 * guaranteed to be no conflicting server state.
 */
export function buildLocalSyncPushPayload(): SyncPushPayload {
  const now = new Date().toISOString();

  // Labels — filter out rows with missing/invalid required fields so that a
  // single corrupted label cannot cause the entire first-sync push to fail.
  const rawLabels = safeParseJsonArray(TIME_TRACKING_STORAGE_KEYS.labels) as TimeTrackingLabel[];
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
  const rawTasks = safeParseJsonArray(
    TIME_TRACKING_STORAGE_KEYS.tasks,
  ) as StoredTimeTrackingTask[];
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
  const HH_MM_RE = /^\d{2}:\d{2}$/;
  const rawTemplates = safeParseJsonArray(
    TIME_TRACKING_STORAGE_KEYS.templates,
  ) as TimeTrackingTemplate[];
  const templates: TemplateSyncItem[] = rawTemplates
    .filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.text === "string" &&
        t.text.trim().length > 0 &&
        typeof t.start === "string" &&
        HH_MM_RE.test(t.start) &&
        typeof t.stop === "string" &&
        HH_MM_RE.test(t.stop),
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

  // Work locations — iterate all matching localStorage keys
  const workLocations: WorkLocationSyncItem[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(WORK_LOCATIONS_STORAGE_PREFIX)) continue;
    const yearData = safeParseJsonObject(key) as Record<string, WorkLocationInfo>;
    for (const [date, info] of Object.entries(yearData)) {
      if (!info || typeof info.countryCode !== "string") continue;
      workLocations.push({
        date,
        action: "create",
        client_updated_at: now,
        country_code: info.countryCode,
        label: info.label ?? null,
      });
    }
  }

  return { labels, tasks, templates, work_locations: workLocations };
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
  const now = new Date().toISOString();

  const localLabelIds = new Set(localPayload.labels.map((l) => l.id));
  const localTaskIds = new Set(localPayload.tasks.map((t) => t.id));
  const localTemplateIds = new Set(localPayload.templates.map((t) => t.id));
  const localWorkLocationDates = new Set(localPayload.work_locations.map((wl) => wl.date));

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

  return {
    labels: [...localPayload.labels, ...deleteLabels],
    tasks: [...localPayload.tasks, ...deleteTasks],
    templates: [...localPayload.templates, ...deleteTemplates],
    work_locations: [...localPayload.work_locations, ...deleteWorkLocations],
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
  const d = new Date(utcIso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Write a full SyncPullResponse into localStorage, replacing any existing
 * syncable data. Non-syncable data (user state, time-off, developer options,
 * Gantt tasks) is left untouched.
 *
 * Soft-deleted records (deleted_at !== null) are excluded from the local store.
 */
export function applySyncPullResponse(data: SyncPullResponse): void {
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
}
