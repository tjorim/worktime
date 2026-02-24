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
import { isValidScheduleType } from "./scheduleUtils";

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

/**
 * Options controlling which sections and which year to include in a backup.
 * Omitted include flags default to true (include everything).
 */
export type BackupOptions = {
  /** When set, filters tasks and work location data to this year only. */
  year?: number;
  includeUserState?: boolean;
  includeTimeOff?: boolean;
  includeWorkLocations?: boolean;
  includeTasks?: boolean;
  includeTemplates?: boolean;
  includeLabels?: boolean;
};

/**
 * Summary of which data categories are present in localStorage.
 * Used to drive the BackupDialog UI — only categories with data are shown.
 */
export type BackupDataPresence = {
  hasUserState: boolean;
  hasTimeOff: boolean;
  hasWorkLocations: boolean;
  hasTasks: boolean;
  hasTemplates: boolean;
  hasLabels: boolean;
  /** Years that have tasks or work location data, sorted newest-first. */
  availableYears: number[];
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

function getWorkLocationEntriesForYear(year: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const key = `${WORK_LOCATIONS_PREFIX}${year}`;
  const data = safeParseJson(key);
  if (data !== undefined) result[String(year)] = data;
  return result;
}

/**
 * Inspect localStorage and return a summary of which data categories exist
 * and which years have year-scoped data (tasks, work locations).
 */
export function checkBackupDataPresence(): BackupDataPresence {
  const hasUserState = localStorage.getItem(USER_STATE_KEY) !== null;
  const hasTimeOff = !!localStorage.getItem(TIME_OFF_STORAGE_KEY);

  const taskYears = new Set<number>();
  const tasksData = safeParseJson(TIME_TRACKING_STORAGE_KEYS.tasks);
  const hasTasks = Array.isArray(tasksData) && tasksData.length > 0;
  if (hasTasks && Array.isArray(tasksData)) {
    for (const task of tasksData) {
      if (task && typeof task === "object") {
        const t = task as Record<string, unknown>;
        if (typeof t.startTime === "string") {
          const year = parseInt(t.startTime.slice(0, 4), 10);
          if (!isNaN(year)) taskYears.add(year);
        }
      }
    }
  }

  const templatesData = safeParseJson(TIME_TRACKING_STORAGE_KEYS.templates);
  const hasTemplates = Array.isArray(templatesData) && templatesData.length > 0;

  const labelsData = safeParseJson(TIME_TRACKING_STORAGE_KEYS.labels);
  const hasLabels = Array.isArray(labelsData) && labelsData.length > 0;

  const workLocationYears = new Set<number>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(WORK_LOCATIONS_PREFIX)) {
      const year = parseInt(key.slice(WORK_LOCATIONS_PREFIX.length), 10);
      if (!isNaN(year)) workLocationYears.add(year);
    }
  }
  const hasWorkLocations = workLocationYears.size > 0;

  const availableYears = Array.from(new Set([...taskYears, ...workLocationYears])).sort(
    (a, b) => b - a,
  );

  return {
    hasUserState,
    hasTimeOff,
    hasWorkLocations,
    hasTasks,
    hasTemplates,
    hasLabels,
    availableYears,
  };
}

/**
 * Collect all backed-up app data from localStorage into a payload object.
 * Pass `options` to restrict which sections are included or to filter by year.
 */
export function buildBackupPayload(options?: BackupOptions): AppBackupPayload {
  const include = {
    userState: options?.includeUserState ?? true,
    timeOff: options?.includeTimeOff ?? true,
    workLocations: options?.includeWorkLocations ?? true,
    tasks: options?.includeTasks ?? true,
    templates: options?.includeTemplates ?? true,
    labels: options?.includeLabels ?? true,
  };

  const payload: AppBackupPayload = {
    exportedAt: new Date().toISOString(),
    version: 1,
  };

  if (include.userState) {
    const userState = safeParseJson(USER_STATE_KEY);
    if (userState !== undefined) payload.userState = userState;
  }

  if (include.timeOff) {
    const timeOff = localStorage.getItem(TIME_OFF_STORAGE_KEY);
    if (timeOff) payload.timeOff = timeOff;
  }

  if (include.workLocations) {
    const workLocations =
      options?.year !== undefined
        ? getWorkLocationEntriesForYear(options.year)
        : getWorkLocationEntries();
    if (Object.keys(workLocations).length > 0) payload.workLocations = workLocations;
  }

  if (include.tasks) {
    const allTasks = safeParseJson(TIME_TRACKING_STORAGE_KEYS.tasks);
    if (Array.isArray(allTasks)) {
      const tasks =
        options?.year !== undefined
          ? allTasks.filter((t: unknown) => {
              if (t && typeof t === "object") {
                const task = t as Record<string, unknown>;
                return (
                  typeof task.startTime === "string" &&
                  task.startTime.startsWith(`${options.year}-`)
                );
              }
              return false;
            })
          : allTasks;
      if (tasks.length > 0) payload.tasks = tasks;
    }
  }

  if (include.templates) {
    const templates = safeParseJson(TIME_TRACKING_STORAGE_KEYS.templates);
    if (Array.isArray(templates)) payload.templates = templates;
  }

  if (include.labels) {
    const labels = safeParseJson(TIME_TRACKING_STORAGE_KEYS.labels);
    if (Array.isArray(labels)) payload.labels = labels;
  }

  return payload;
}

/**
 * Build a backup payload and trigger a browser download of the JSON file.
 *
 * @param date - ISO date string (YYYY-MM-DD) used in the filename.
 * @param options - Optional section/year filter for partial backups.
 */
export function downloadAppBackup(date: string, options?: BackupOptions): void {
  const payload = buildBackupPayload(options);
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

  // Must have at least one recognizable section
  const hasAnySection =
    "userState" in p ||
    "timeOff" in p ||
    "workLocations" in p ||
    "tasks" in p ||
    "templates" in p ||
    "labels" in p;
  if (!hasAnySection) return false;

  if ("userState" in p && p.userState !== undefined) {
    const us = p.userState;
    if (!us || typeof us !== "object" || Array.isArray(us)) return false;
    const usObj = us as Record<string, unknown>;
    if (
      "scheduleType" in usObj &&
      usObj.scheduleType !== null &&
      usObj.scheduleType !== undefined &&
      !isValidScheduleType(usObj.scheduleType)
    ) {
      return false;
    }
  }

  if ("workLocations" in p && p.workLocations !== undefined) {
    const wl = p.workLocations;
    if (!wl || typeof wl !== "object" || Array.isArray(wl)) return false;
    for (const yearData of Object.values(wl as Record<string, unknown>)) {
      if (!yearData || typeof yearData !== "object" || Array.isArray(yearData)) return false;
      for (const dayEntry of Object.values(yearData as Record<string, unknown>)) {
        if (!dayEntry || typeof dayEntry !== "object") return false;
        const entry = dayEntry as Record<string, unknown>;
        if (typeof entry.location !== "string") return false;
        if (typeof entry.countryCode !== "string") return false;
      }
    }
  }

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
