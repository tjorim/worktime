/**
 * Current-state application backup and restore utilities.
 *
 * Covers all meaningful user data:
 * - User settings & preferences (still stored in localStorage)
 * - Sync-managed domains now backed by TanStack DB collections
 *   (time-off, work locations, time tracking, gantt)
 *
 * Device-specific data (developer options, sync cursor, outbox) is excluded.
 */

import { dayjs } from "@/utils/dateTimeUtils";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import { normalizeTimeOffEntries } from "@/lib/timeOff/storage";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import type { GanttTask } from "@/types/gantt";
import type { WorkLocationEntry } from "@/types/workLocation";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { isValidScheduleType } from "./scheduleUtils";

export type AppBackupPayload = {
  exportedAt: string;
  version: 1;
  userState?: unknown;
  timeOff?: unknown[];
  workLocations?: Record<string, unknown>;
  tasks?: unknown[];
  templates?: unknown[];
  labels?: unknown[];
  ganttTasks?: unknown[];
};

/**
 * Options controlling which sections to include in a backup.
 * Omitted include flags default to true.
 */
export type BackupOptions = {
  includeUserState?: boolean;
  includeTimeOff?: boolean;
  includeWorkLocations?: boolean;
  includeTasks?: boolean;
  includeTemplates?: boolean;
  includeLabels?: boolean;
  includeGanttTasks?: boolean;
};

/**
 * Summary of which backup sections currently have data.
 * Used to drive the BackupDialog UI.
 */
export type BackupDataPresence = {
  hasUserState: boolean;
  hasTimeOff: boolean;
  hasWorkLocations: boolean;
  hasTasks: boolean;
  hasTemplates: boolean;
  hasLabels: boolean;
  hasGanttTasks: boolean;
};

function safeParseJson(key: string): unknown {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : undefined;
  } catch {
    return undefined;
  }
}

function toPlainTask(task: StoredTimeTrackingTask): StoredTimeTrackingTask {
  return {
    id: task.id,
    text: task.text,
    label: task.label,
    startTime: task.startTime,
    ...(task.stopTime ? { stopTime: task.stopTime } : {}),
    ...(task.includesBreak === true ? { includesBreak: true } : {}),
  };
}

function toPlainTemplate(template: TimeTrackingTemplate): TimeTrackingTemplate {
  return {
    id: template.id,
    text: template.text,
    label: template.label,
    start: template.start,
    stop: template.stop,
  };
}

function toPlainLabel(label: TimeTrackingLabel): TimeTrackingLabel {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
  };
}

function toPlainGanttTask(task: GanttTask): GanttTask {
  return {
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    progress: task.progress,
    ...(task.dependencies ? { dependencies: task.dependencies } : {}),
    ...(task.notes ? { notes: task.notes } : {}),
  };
}

function toPlainWorkLocation(entry: WorkLocationEntry): WorkLocationEntry {
  return {
    date: entry.date,
    location: entry.location,
    countryCode: entry.countryCode,
    ...(entry.label ? { label: entry.label } : {}),
  };
}

function toPlainTimeOffEntry(entry: TimeOffEntry): TimeOffEntry {
  if (entry.entryKind === "date") {
    return {
      id: entry.id,
      entryKind: "date",
      date: entry.date,
      entryType: entry.entryType,
      entryFlag: entry.entryFlag,
      ...(entry.note ? { note: entry.note } : { note: null }),
    };
  }

  if (entry.entryKind === "range") {
    return {
      id: entry.id,
      entryKind: "range",
      start: entry.start,
      end: entry.end,
      entryType: entry.entryType,
      entryFlag: entry.entryFlag,
      ...(entry.note ? { note: entry.note } : { note: null }),
    };
  }

  return {
    id: entry.id,
    entryKind: "weekly",
    weekday: entry.weekday,
    entryType: entry.entryType,
    entryFlag: entry.entryFlag,
    ...(entry.note ? { note: entry.note } : { note: null }),
  };
}

function getWorkLocationEntries(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const entries = (workLocationsCollection.toArray as WorkLocationEntry[]).map(toPlainWorkLocation);

  for (const entry of entries) {
    const entryYear = entry.date.slice(0, 4);
    const bucket = (result[entryYear] ??= {}) as Record<string, unknown>;
    bucket[entry.date] = {
      location: entry.location,
      countryCode: entry.countryCode,
      ...(entry.label ? { label: entry.label } : {}),
    };
  }

  return result;
}

/** Inspect local storage and collections and return which backup sections have data. */
export function checkBackupDataPresence(): BackupDataPresence {
  const hasUserState = localStorage.getItem(USER_STATE_STORAGE_KEY) !== null;
  const timeOffEntries = (timeOffCollection.toArray as TimeOffEntry[]).map(toPlainTimeOffEntry);
  const hasTimeOff = timeOffEntries.length > 0;

  const tasksData = (tasksCollection.toArray as StoredTimeTrackingTask[]).map(toPlainTask);
  const hasTasks = tasksData.length > 0;

  const templatesData = (templatesCollection.toArray as TimeTrackingTemplate[]).map(toPlainTemplate);
  const hasTemplates = templatesData.length > 0;

  const labelsData = (labelsCollection.toArray as TimeTrackingLabel[]).map(toPlainLabel);
  const hasLabels = labelsData.length > 0;

  const hasWorkLocations = (workLocationsCollection.toArray as WorkLocationEntry[]).length > 0;

  const ganttData = (ganttTasksCollection.toArray as GanttTask[]).map(toPlainGanttTask);
  const hasGanttTasks = ganttData.length > 0;

  return {
    hasUserState,
    hasTimeOff,
    hasWorkLocations,
    hasTasks,
    hasTemplates,
    hasLabels,
    hasGanttTasks,
  };
}

/**
 * Collect the current app state into a backup payload object.
 * Pass `options` to restrict which sections are included.
 */
export function buildBackupPayload(options?: BackupOptions): AppBackupPayload {
  const include = {
    userState: options?.includeUserState ?? true,
    timeOff: options?.includeTimeOff ?? true,
    workLocations: options?.includeWorkLocations ?? true,
    tasks: options?.includeTasks ?? true,
    templates: options?.includeTemplates ?? true,
    labels: options?.includeLabels ?? true,
    ganttTasks: options?.includeGanttTasks ?? true,
  };

  const payload: AppBackupPayload = {
    exportedAt: dayjs().toISOString(),
    version: 1,
  };

  if (include.userState) {
    const userState = safeParseJson(USER_STATE_STORAGE_KEY);
    if (userState !== undefined) payload.userState = userState;
  }

  if (include.timeOff) {
    const timeOff = (timeOffCollection.toArray as TimeOffEntry[]).map(toPlainTimeOffEntry);
    if (timeOff.length > 0) payload.timeOff = timeOff;
  }

  if (include.workLocations) {
    const workLocations = getWorkLocationEntries();
    if (Object.keys(workLocations).length > 0) payload.workLocations = workLocations;
  }

  if (include.tasks) {
    const tasks = (tasksCollection.toArray as StoredTimeTrackingTask[]).map(toPlainTask);
    if (tasks.length > 0) payload.tasks = tasks;
  }

  if (include.templates) {
    const templates = (templatesCollection.toArray as TimeTrackingTemplate[]).map(toPlainTemplate);
    if (templates.length > 0) payload.templates = templates;
  }

  if (include.labels) {
    const labels = (labelsCollection.toArray as TimeTrackingLabel[]).map(toPlainLabel);
    if (labels.length > 0) payload.labels = labels;
  }

  if (include.ganttTasks) {
    const ganttTasks = (ganttTasksCollection.toArray as GanttTask[]).map(toPlainGanttTask);
    if (ganttTasks.length > 0) payload.ganttTasks = ganttTasks;
  }

  return payload;
}

/**
 * Build a backup payload and trigger a browser download of the JSON file.
 *
 * @param date - ISO date string (YYYY-MM-DD) used in the filename.
 * @param options - Optional section filter for partial backups.
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
    "labels" in p ||
    "ganttTasks" in p;
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

  if ("timeOff" in p && p.timeOff !== undefined && !Array.isArray(p.timeOff)) {
    return false;
  }
  if ("tasks" in p && p.tasks !== undefined && !Array.isArray(p.tasks)) return false;
  if ("templates" in p && p.templates !== undefined && !Array.isArray(p.templates)) return false;
  if ("labels" in p && p.labels !== undefined && !Array.isArray(p.labels)) return false;
  if ("ganttTasks" in p && p.ganttTasks !== undefined && !Array.isArray(p.ganttTasks)) return false;

  return true;
}

function parseWorkLocationEntries(workLocations: Record<string, unknown>): WorkLocationEntry[] {
  const incomingEntries: WorkLocationEntry[] = [];

  for (const yearData of Object.values(workLocations)) {
    if (!yearData || typeof yearData !== "object" || Array.isArray(yearData)) continue;
    for (const [date, value] of Object.entries(yearData as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.location !== "string" || typeof entry.countryCode !== "string") continue;
      incomingEntries.push({
        date,
        location: entry.location as WorkLocationEntry["location"],
        countryCode: entry.countryCode as WorkLocationEntry["countryCode"],
        ...(typeof entry.label === "string" && entry.label.length > 0 ? { label: entry.label } : {}),
      });
    }
  }

  return incomingEntries;
}

function replaceCollectionById<T extends { id: string }>(
  collection: {
    toArray: T[];
    has: (id: string) => boolean;
    insert: (item: T) => void;
    update: (id: string, cb: (draft: T) => void) => void;
    delete: (id: string) => void;
  },
  items: T[],
): void {
  const nextIds = new Set(items.map((item) => item.id));

  for (const item of items) {
    if (collection.has(item.id)) {
      collection.update(item.id, (draft) => {
        Object.assign(draft, item);
      });
    } else {
      collection.insert(item);
    }
  }

  for (const existing of collection.toArray) {
    if (!nextIds.has(existing.id) && collection.has(existing.id)) {
      collection.delete(existing.id);
    }
  }
}

/**
 * Write each section from the backup payload to the current storage model,
 * replacing the current contents of any included section, then reload the page
 * so all React contexts pick up the restored values.
 *
 * Only sections present in the payload are restored; absent sections are left
 * untouched.
 */
export function restoreAppBackup(payload: AppBackupPayload): void {
  if (payload.userState !== undefined) {
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(payload.userState));
  }

  if (Array.isArray(payload.timeOff)) {
    replaceCollectionById(
      timeOffCollection as unknown as {
        toArray: TimeOffEntry[];
        has: (id: string) => boolean;
        insert: (item: TimeOffEntry) => void;
        update: (id: string, cb: (draft: TimeOffEntry) => void) => void;
        delete: (id: string) => void;
      },
      normalizeTimeOffEntries(payload.timeOff),
    );
  }

  if (payload.workLocations && typeof payload.workLocations === "object") {
    replaceCollectionById(
      workLocationsCollection as unknown as {
        toArray: WorkLocationEntry[];
        has: (id: string) => boolean;
        insert: (item: WorkLocationEntry) => void;
        update: (id: string, cb: (draft: WorkLocationEntry) => void) => void;
        delete: (id: string) => void;
      },
      parseWorkLocationEntries(payload.workLocations),
    );
  }

  if (Array.isArray(payload.tasks)) {
    replaceCollectionById(
      tasksCollection as unknown as {
        toArray: StoredTimeTrackingTask[];
        has: (id: string) => boolean;
        insert: (item: StoredTimeTrackingTask) => void;
        update: (id: string, cb: (draft: StoredTimeTrackingTask) => void) => void;
        delete: (id: string) => void;
      },
      payload.tasks as StoredTimeTrackingTask[],
    );
  }

  if (Array.isArray(payload.templates)) {
    replaceCollectionById(
      templatesCollection as unknown as {
        toArray: TimeTrackingTemplate[];
        has: (id: string) => boolean;
        insert: (item: TimeTrackingTemplate) => void;
        update: (id: string, cb: (draft: TimeTrackingTemplate) => void) => void;
        delete: (id: string) => void;
      },
      payload.templates as TimeTrackingTemplate[],
    );
  }

  if (Array.isArray(payload.labels)) {
    replaceCollectionById(
      labelsCollection as unknown as {
        toArray: TimeTrackingLabel[];
        has: (id: string) => boolean;
        insert: (item: TimeTrackingLabel) => void;
        update: (id: string, cb: (draft: TimeTrackingLabel) => void) => void;
        delete: (id: string) => void;
      },
      payload.labels as TimeTrackingLabel[],
    );
  }

  if (Array.isArray(payload.ganttTasks)) {
    replaceCollectionById(
      ganttTasksCollection as unknown as {
        toArray: GanttTask[];
        has: (id: string) => boolean;
        insert: (item: GanttTask) => void;
        update: (id: string, cb: (draft: GanttTask) => void) => void;
        delete: (id: string) => void;
      },
      payload.ganttTasks as GanttTask[],
    );
  }

  window.location.reload();
}
