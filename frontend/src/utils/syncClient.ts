/**
 * Sync API client utilities.
 *
 * Provides typed wrappers around the backend sync endpoints
 * (GET /db/sync/status, POST /db/sync/push, GET /db/sync/pull)
 * and helpers to convert between localStorage formats and the
 * sync API wire format.
 *
 * Entities synced: tasks, templates, labels, work locations,
 * time-off entries, and user preferences.
 */

import dayjs from "dayjs";
import { TIME_TRACKING_STORAGE_KEYS } from "../components/timeTracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "../components/timeTracking/types";
import type { TimeTrackingLabel } from "../components/timeTracking/constants";
import type { HdayEvent } from "../lib/hday/types";
import type { WorkLocationInfo } from "../types/workLocation";
import { WORK_LOCATIONS_STORAGE_PREFIX, USER_STATE_STORAGE_KEY } from "../constants/storageKeys";
import {
  createTimeOffEntry,
  getEntryTimeFlagsFromDisplayFlags,
  getEntryTypeFromDisplayFlags,
  hdayToTimeOffEntries,
} from "../lib/timeOff/codecs";
import {
  LEGACY_TIME_OFF_STORAGE_KEY,
  loadTimeOffEntries,
  saveTimeOffEntries,
} from "../lib/timeOff/storage";
import type { TimeOffEntry } from "../lib/timeOff/types";
import { isTimeOffDateEntry } from "../lib/timeOff/types";

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
  date: string;
  action: SyncAction;
  client_updated_at: string;
  entry_type?: string | null;
  flags?: string[] | null;
  note?: string | null;
}

export interface SyncPushPayload {
  labels: LabelSyncItem[];
  tasks: TaskSyncItem[];
  templates: TemplateSyncItem[];
  work_locations: WorkLocationSyncItem[];
  time_off_entries: TimeOffEntrySyncItem[];
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
  user_id: number;
  date: string;
  entry_type: string;
  flags: string[];
  note: string | null;
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
  server_timestamp: string;
}

export interface SyncStatusResponse {
  labels_updated_at: string | null;
  tasks_updated_at: string | null;
  templates_updated_at: string | null;
  work_locations_updated_at: string | null;
  time_off_entries_updated_at: string | null;
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
    // Use != null (loose equality) to treat both null and undefined as "no data".
    // Tests and legacy callers may omit the newer fields from their mock objects.
    status.labels_updated_at != null ||
    status.tasks_updated_at != null ||
    status.templates_updated_at != null ||
    status.work_locations_updated_at != null ||
    status.time_off_entries_updated_at != null ||
    status.preferences_updated_at != null
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
    const response = await fetch("/db/preferences");
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
    const response = await fetch("/db/preferences", {
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
    return {
      data: parsed as Record<string, unknown>,
      clientUpdatedAt: dayjs().toISOString(),
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
 * Build a SyncPushPayload from the current localStorage contents.
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
  // Strict time validation: hours 00-23, minutes 00-59.
  const isValidTime = (time: string): boolean => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
    const parts = time.split(":").map(Number);
    const h = parts[0];
    const m = parts[1];
    return h !== undefined && h >= 0 && h <= 23 && m !== undefined && m >= 0 && m <= 59;
  };
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

  // Work locations — iterate all matching localStorage keys
  // Validate date keys: must be YYYY-MM-DD and produce a valid calendar date.
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
  const workLocations: WorkLocationSyncItem[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(WORK_LOCATIONS_STORAGE_PREFIX)) continue;
    const yearData = safeParseJsonObject(key) as Record<string, WorkLocationInfo>;
    for (const [date, info] of Object.entries(yearData)) {
      if (!info || typeof info.countryCode !== "string") continue;
      // Validate the date key before pushing.
      if (!isValidDateKey(date)) continue;
      workLocations.push({
        date,
        action: "create",
        client_updated_at: now,
        country_code: info.countryCode,
        label: info.label ?? null,
      });
    }
  }

  const legacyRawTimeOff = localStorage.getItem(LEGACY_TIME_OFF_STORAGE_KEY);
  const localTimeOffEntries: TimeOffEntry[] =
    loadTimeOffEntries().length > 0
      ? loadTimeOffEntries()
      : legacyRawTimeOff
        ? hdayToTimeOffEntries(legacyRawTimeOff).entries
        : [];

  const timeOffEntries = localTimeOffEntries
    .filter(isTimeOffDateEntry)
    .map((entry) => ({
      date: entry.date,
      action: "create" as const,
      client_updated_at: now,
      entry_type: entry.entryType,
      flags: entry.flags,
      note: entry.note,
    }));

  return { labels, tasks, templates, work_locations: workLocations, time_off_entries: timeOffEntries };
}

// ---------------------------------------------------------------------------
// Time-off conversion helpers
// ---------------------------------------------------------------------------

/** Convert a backend ISO date string (YYYY-MM-DD) to the .hday date format (YYYY/MM/DD). */
function isoToHdayDate(isoDate: string): string {
  return isoDate.replace(/-/g, "/");
}

/**
 * Convert an array of .hday HdayEvent objects to TimeOffEntrySyncItem records.
 *
 * - Only "range" type events are converted (weekly events are skipped — they
 *   cannot be represented as individual date-keyed backend entries).
 * - Date ranges are expanded to one entry per calendar day.
 * - The entry_type is derived from the event's type flags; defaults to "vacation".
 * - Time/location flags (e.g. half_am, half_pm, onsite) are preserved in `flags`.
 * - The event title becomes the `note` field.
 */
export function hdayEventsToSyncItems(
  events:
    | Array<{
        date: string;
        entryType: TimeOffEntry["entryType"];
        flags: TimeOffEntry["flags"];
        note: string | null;
      }>
    | HdayEvent[],
  clientUpdatedAt: string,
): TimeOffEntrySyncItem[] {
  if (events.length === 0) return [];

  const first = events[0] as
    | {
        date: string;
        entryType: TimeOffEntry["entryType"];
        flags: TimeOffEntry["flags"];
        note: string | null;
      }
    | HdayEvent;
  if ("date" in first) {
    return (events as Array<{
      date: string;
      entryType: TimeOffEntry["entryType"];
      flags: TimeOffEntry["flags"];
      note: string | null;
    }>).map(
      (entry) => ({
        date: entry.date,
        action: "create",
        client_updated_at: clientUpdatedAt,
        entry_type: entry.entryType,
        flags: entry.flags,
        note: entry.note,
      }),
    );
  }

  const items: TimeOffEntrySyncItem[] = [];
  for (const event of events as HdayEvent[]) {
    if (event.type !== "range" || !event.start) continue;

    const start = dayjs(event.start.replace(/\//g, "-")).startOf("day");
    const end = dayjs((event.end ?? event.start).replace(/\//g, "-")).startOf("day");
    if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) continue;

    const entryType = getEntryTypeFromDisplayFlags(event.flags ?? ["holiday"]);
    const flags = getEntryTimeFlagsFromDisplayFlags(event.flags ?? []);
    let current = start;

    while (current.isSameOrBefore(end, "day")) {
      items.push({
        date: current.format("YYYY-MM-DD"),
        action: "create",
        client_updated_at: clientUpdatedAt,
        entry_type: entryType,
        flags,
        note: event.title?.trim() || null,
      });
      current = current.add(1, "day");
    }
  }

  return items;
}

/**
 * Convert an array of TimeOffEntrySyncRead items (from a pull response) to a
 * raw .hday text string that can be stored in localStorage.
 *
 * Each entry becomes a single-date range event. The entry_type is mapped back
 * to a type flag (or "holiday" for "vacation"). Non-type flags are preserved.
 * The note becomes the event title.
 */
export function syncItemsToHdayRaw(items: TimeOffEntrySyncRead[]): string {
  const ENTRY_TYPE_TO_FLAG: Record<string, string | null> = {
    vacation: null, // holiday is the .hday default (no explicit flag)
    business: "b",
    ill: "i",
    in: "k",
    course: "s",
    other: "u",
    weekend: "e",
    birthday: "h",
  };
  const FLAG_CHAR: Record<string, string> = {
    half_am: "a",
    half_pm: "p",
    onsite: "w",
    no_fly: "n",
    can_fly: "f",
  };

  const lines: string[] = [];
  for (const item of items) {
    if (item.deleted_at !== null) continue;
    // Convert YYYY-MM-DD to YYYY/MM/DD for .hday format
    const hdayDate = isoToHdayDate(item.date);
    if (!hdayDate.includes("/")) continue; // guard against non-date strings

    const typeChar = ENTRY_TYPE_TO_FLAG[item.entry_type] ?? null;
    const locChars = (item.flags ?? [])
      .map((f) => FLAG_CHAR[f] ?? "")
      .filter((c) => c.length > 0)
      .join("");

    const prefix = `${typeChar ?? ""}${locChars}`;
    const titleSuffix = item.note ? ` # ${item.note}` : "";
    lines.push(`${prefix}${hdayDate}${titleSuffix}`);
  }
  return lines.join("\n");
}

function syncItemsToTimeOffEntries(items: TimeOffEntrySyncRead[]): TimeOffEntry[] {
  return items
    .filter((item) => item.deleted_at === null)
    .map((item) =>
      createTimeOffEntry({
        kind: "date",
        date: item.date,
        entryType: (item.entry_type === "vacation" ? "vacation" : item.entry_type) as TimeOffEntry["entryType"],
        flags: item.flags as TimeOffEntry["flags"],
        note: item.note,
      }),
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
  const localTimeOffDates = new Set((localPayload.time_off_entries ?? []).map((e) => e.date));

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
    .filter((e) => !localTimeOffDates.has(e.date) && e.deleted_at === null)
    .map((e) => ({ date: e.date, action: "delete", client_updated_at: now }));

  return {
    labels: [...localPayload.labels, ...deleteLabels],
    tasks: [...localPayload.tasks, ...deleteTasks],
    templates: [...localPayload.templates, ...deleteTemplates],
    work_locations: [...localPayload.work_locations, ...deleteWorkLocations],
    time_off_entries: [...localPayload.time_off_entries, ...deleteTimeOffEntries],
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
 * syncable data. Developer options and Gantt tasks are left untouched.
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

  saveTimeOffEntries(syncItemsToTimeOffEntries(data.time_off_entries ?? []));
}
