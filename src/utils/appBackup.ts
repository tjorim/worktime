/**
 * Full application backup and restore utilities.
 *
 * Covers all meaningful user data stored in localStorage:
 * - User settings & preferences (worktime_user_state)
 * - Time-off events (.hday raw text)
 * - Work location entries (per-year keys)
 * - Time tracking tasks, templates and labels
 *
 * Device-specific data (developer options) is intentionally excluded.
 */

import { TIME_OFF_STORAGE_KEY } from "../contexts/EventStoreContext";
import { TIME_TRACKING_STORAGE_KEYS } from "../components/timeTracking/constants";

const USER_STATE_KEY = "worktime_user_state";
const WORK_LOCATIONS_PREFIX = "worktime_work_locations_";

export type AppBackupPayload = {
  exportedAt: string;
  version: 1;
  userState?: unknown;
  timeOff?: string;
  workLocations?: Record<string, unknown>;
  tasks?: unknown[];
  templates?: unknown[];
  labels?: unknown[];
};

function safeParseJson(key: string): unknown {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : undefined;
  } catch {
    return undefined;
  }
}

function getWorkLocationEntries(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(WORK_LOCATIONS_PREFIX)) {
      const year = key.slice(WORK_LOCATIONS_PREFIX.length);
      const data = safeParseJson(key);
      if (data !== undefined) result[year] = data;
    }
  }
  return result;
}

/**
 * Collect all backed-up app data from localStorage into a payload object.
 */
export function buildBackupPayload(): AppBackupPayload {
  const payload: AppBackupPayload = {
    exportedAt: new Date().toISOString(),
    version: 1,
  };

  const userState = safeParseJson(USER_STATE_KEY);
  if (userState !== undefined) payload.userState = userState;

  const timeOff = localStorage.getItem(TIME_OFF_STORAGE_KEY);
  if (timeOff) payload.timeOff = timeOff;

  const workLocations = getWorkLocationEntries();
  if (Object.keys(workLocations).length > 0) payload.workLocations = workLocations;

  const tasks = safeParseJson(TIME_TRACKING_STORAGE_KEYS.tasks);
  if (Array.isArray(tasks)) payload.tasks = tasks;

  const templates = safeParseJson(TIME_TRACKING_STORAGE_KEYS.templates);
  if (Array.isArray(templates)) payload.templates = templates;

  const labels = safeParseJson(TIME_TRACKING_STORAGE_KEYS.labels);
  if (Array.isArray(labels)) payload.labels = labels;

  return payload;
}

/**
 * Build a backup payload and trigger a browser download of the JSON file.
 *
 * @param date - ISO date string (YYYY-MM-DD) used in the filename.
 */
export function downloadAppBackup(date: string): void {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `worktime-backup-${date}.json`;
  anchor.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Validate that a parsed JSON value looks like an AppBackupPayload.
 *
 * Accepts full backups as well as partial files (only some sections present).
 * The time-tracking-only format exported by the existing "Export Data" button
 * (tasks/templates/labels only, no version/exportedAt) is intentionally NOT
 * matched here — the caller should continue to use the existing import path
 * for that format.
 */
export function validateAppBackupPayload(parsed: unknown): parsed is AppBackupPayload {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;

  // Must have at least one recognisable section
  const hasAnySection =
    "userState" in p ||
    "timeOff" in p ||
    "workLocations" in p ||
    "tasks" in p ||
    "templates" in p ||
    "labels" in p;
  if (!hasAnySection) return false;

  if ("timeOff" in p && p.timeOff !== undefined && typeof p.timeOff !== "string") return false;
  if ("tasks" in p && p.tasks !== undefined && !Array.isArray(p.tasks)) return false;
  if ("templates" in p && p.templates !== undefined && !Array.isArray(p.templates)) return false;
  if ("labels" in p && p.labels !== undefined && !Array.isArray(p.labels)) return false;

  return true;
}

/**
 * Write each section from the backup payload to localStorage, then reload the
 * page so all React contexts pick up the restored values.
 *
 * Only sections present in the payload are restored; absent sections are left
 * untouched.
 */
export function restoreAppBackup(payload: AppBackupPayload): void {
  if (payload.userState !== undefined) {
    localStorage.setItem(USER_STATE_KEY, JSON.stringify(payload.userState));
  }

  if (typeof payload.timeOff === "string") {
    localStorage.setItem(TIME_OFF_STORAGE_KEY, payload.timeOff);
  }

  if (payload.workLocations && typeof payload.workLocations === "object") {
    for (const [year, data] of Object.entries(payload.workLocations)) {
      localStorage.setItem(`${WORK_LOCATIONS_PREFIX}${year}`, JSON.stringify(data));
    }
  }

  if (Array.isArray(payload.tasks)) {
    localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.tasks, JSON.stringify(payload.tasks));
  }

  if (Array.isArray(payload.templates)) {
    localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.templates, JSON.stringify(payload.templates));
  }

  if (Array.isArray(payload.labels)) {
    localStorage.setItem(TIME_TRACKING_STORAGE_KEYS.labels, JSON.stringify(payload.labels));
  }

  window.location.reload();
}
