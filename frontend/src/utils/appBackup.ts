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
  getSyncCollectionUserId,
  hasSyncCollectionAuth,
  labelsCollection,
  preloadSyncCollections,
  replaceCollectionContents,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/db/collections";
import { normalizeTimeOffEntries } from "@/lib/timeOff/storage";
import {
  appendToSyncOutbox,
  buildKeepLocalReplacePayload,
  buildLocalSyncPushPayload,
  countPushConflicts,
  isEmptyPushPayload,
  pullSyncData,
  pushSyncPayload,
  type FetchFn,
  type SyncPushPayload,
} from "@/utils/syncClient";
import { logger } from "@/utils/logger";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/timeTracking/types";
import type { Label } from "@/lib/timeTracking/constants";
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

function toPlainLabel(label: Label): Label {
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

  const templatesData = (templatesCollection.toArray as TimeTrackingTemplate[]).map(
    toPlainTemplate,
  );
  const hasTemplates = templatesData.length > 0;

  const labelsData = (labelsCollection.toArray as Label[]).map(toPlainLabel);
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
    const labels = (labelsCollection.toArray as Label[]).map(toPlainLabel);
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
      if (typeof entry.countryCode !== "string") continue;
      incomingEntries.push({
        date,
        countryCode: entry.countryCode as WorkLocationEntry["countryCode"],
        ...(typeof entry.label === "string" && entry.label.length > 0
          ? { label: entry.label }
          : {}),
      });
    }
  }

  return incomingEntries;
}

/**
 * Write each section from the backup payload to the current storage model,
 * push the restored state to the server as one "keep local" replace (on a
 * synced account), and only then reload the page so all React contexts pick
 * up the restored values.
 *
 * Only sections present in the payload are restored; absent sections are left
 * untouched both locally and on the server — the server replace is scoped to
 * exactly the domains the backup included, never to whatever the rest of the
 * account's collections happen to hold locally (which may legitimately be
 * behind the server on a device that hasn't fully synced yet).
 *
 * Collection writes use the direct-write batch API (same path as an
 * incoming sync pull) rather than the optimistic insert/update/delete API, so
 * no push handlers fire — the server side is instead driven explicitly below
 * via a single push, which the caller can await before reloading. Reloading
 * immediately after N per-record optimistic pushes (the previous behavior)
 * let the navigation abort those in-flight requests, so the server never
 * learned about the restore and the next pull silently brought the old data
 * back.
 *
 * `fetchFn` is required to sync the restore to the server; omit it (or when
 * the account isn't signed in) to restore local-only. On a signed-in account
 * with no `fetchFn`, the restored local state is not pushed and will be
 * overwritten by the next sync pull — callers on a synced account must pass
 * one.
 *
 * Throws if the server round-trip fails, or if the server accepts the push
 * but reports a per-record conflict (a concurrent write on another device won
 * last-write-wins for that record) — a silent partial success would let the
 * next regular sync pull quietly revert just those records, leaving the
 * restore looking like it worked when part of it didn't. The restored local
 * state stays in place either way (already durably written). If the pre-push
 * server pull fails, nothing is queued — there is no server snapshot to diff
 * against, so there is no way to compute which server-only records the
 * replace should delete, and queuing a create-only payload would silently
 * drop those deletes. If the push itself fails outright after a successful
 * pull, the full replace payload (including its deletes and its
 * `allow_bulk_delete` opt-in) is queued in the sync outbox for the next
 * successful sync cycle; a partial per-record conflict is not queued, since
 * re-sending already-accepted records is redundant and the conflicted ones
 * would just conflict again. Either way, callers should surface an error and
 * must not treat a throw as fatal to the local restore. Does not throw for a
 * backup that restores no collection data
 * (nothing to push).
 */
export async function restoreAppBackup(
  payload: AppBackupPayload,
  fetchFn?: FetchFn,
): Promise<void> {
  if (
    payload.userState !== undefined &&
    typeof payload.userState === "object" &&
    payload.userState !== null
  ) {
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({
        ...(payload.userState as Record<string, unknown>),
        // The restore is the newest intent for this device — without this,
        // reconcilePreferences compares export-time timestamps against the
        // server's, and any backup older than the account's current server
        // copy loses the last-write-wins check and gets silently overwritten.
        _updatedAt: new Date().toISOString(),
      }),
    );
  }

  if (Array.isArray(payload.timeOff)) {
    replaceCollectionContents(
      timeOffCollection,
      normalizeTimeOffEntries(payload.timeOff),
      (entry) => entry.id,
    );
  }

  if (payload.workLocations && typeof payload.workLocations === "object") {
    replaceCollectionContents(
      workLocationsCollection,
      parseWorkLocationEntries(payload.workLocations),
      (entry) => entry.date,
    );
  }

  if (Array.isArray(payload.tasks)) {
    replaceCollectionContents(
      tasksCollection,
      payload.tasks as StoredTimeTrackingTask[],
      (task) => task.id,
    );
  }

  if (Array.isArray(payload.templates)) {
    replaceCollectionContents(
      templatesCollection,
      payload.templates as TimeTrackingTemplate[],
      (template) => template.id,
    );
  }

  if (Array.isArray(payload.labels)) {
    replaceCollectionContents(labelsCollection, payload.labels as Label[], (label) => label.id);
  }

  if (Array.isArray(payload.ganttTasks)) {
    replaceCollectionContents(
      ganttTasksCollection,
      payload.ganttTasks as GanttTask[],
      (task) => task.id,
    );
  }

  if (hasSyncCollectionAuth() && fetchFn) {
    // Only the domains this backup actually included may be replaced
    // server-side. The other collections are read below purely so
    // buildKeepLocalReplacePayload doesn't see them as empty (see its own
    // comment), then their creates/deletes are stripped back out before the
    // push — the payload sent to the server touches exactly the domains the
    // backup restored, nothing else, matching "absent sections are left
    // untouched" for the server side too.
    const includedDomains = {
      labels: Array.isArray(payload.labels),
      tasks: Array.isArray(payload.tasks),
      templates: Array.isArray(payload.templates),
      work_locations: payload.workLocations != null && typeof payload.workLocations === "object",
      time_off_entries: Array.isArray(payload.timeOff),
      gantt_tasks: Array.isArray(payload.ganttTasks),
    } as const satisfies Record<
      keyof Omit<SyncPushPayload, "allow_bulk_delete" | "declared_delete_total">,
      boolean
    >;

    // Collections outside the sections this backup touches must still be read
    // in full to build the replace payload below — an unmounted collection
    // reads as empty, which buildKeepLocalReplacePayload would otherwise
    // read as "delete everything the server has for this domain".
    await preloadSyncCollections();
    const localPayload = buildLocalSyncPushPayload();
    // A backup that restores no collection data has nothing to reconcile —
    // buildKeepLocalReplacePayload would otherwise throw EmptyLocalReplaceError
    // for what is really a no-op, and there is no reason to round-trip to the
    // server for it.
    if (!isEmptyPushPayload(localPayload)) {
      const serverData = await pullSyncData(fetchFn);
      if (!serverData) {
        // No server snapshot to diff against, so there is no way to compute
        // which server-only records this replace should delete. Queuing the
        // create-only localPayload instead would silently drop those
        // deletes, so surface the failure and leave nothing queued — the
        // already-written local state is untouched either way.
        throw new Error("restoreAppBackup: failed to pull server data before push");
      }
      const fullReplacePayload = buildKeepLocalReplacePayload(localPayload, serverData);
      // Drop every domain the backup didn't include — both the creates (which
      // just mirror whatever this device's local copy currently holds) and,
      // critically, the deletes buildKeepLocalReplacePayload computed for it.
      // A domain the backup left untouched must not lose server records just
      // because this device hasn't synced that domain yet.
      const pushPayload: SyncPushPayload = {
        allow_bulk_delete: fullReplacePayload.allow_bulk_delete,
        labels: includedDomains.labels ? fullReplacePayload.labels : [],
        tasks: includedDomains.tasks ? fullReplacePayload.tasks : [],
        templates: includedDomains.templates ? fullReplacePayload.templates : [],
        work_locations: includedDomains.work_locations ? fullReplacePayload.work_locations : [],
        time_off_entries: includedDomains.time_off_entries
          ? fullReplacePayload.time_off_entries
          : [],
        gantt_tasks: includedDomains.gantt_tasks ? fullReplacePayload.gantt_tasks : [],
      };

      if (!isEmptyPushPayload(pushPayload)) {
        const result = await pushSyncPayload(fetchFn, pushPayload);
        if (!result) {
          logger.error("restoreAppBackup: failed to push restored data to server");
          const userId = getSyncCollectionUserId();
          if (userId) appendToSyncOutbox(userId, pushPayload);
          throw new Error("restoreAppBackup: push failed");
        }
        const conflictCount = countPushConflicts(result);
        if (conflictCount > 0) {
          // Some records lost last-write-wins to a concurrent write on
          // another device. Those records were NOT overwritten with the
          // restored values server-side, so the next sync pull would quietly
          // revert them — surface this instead of reloading over it.
          logger.error(`restoreAppBackup: server rejected ${conflictCount} record(s) as conflicts`);
          throw new Error("restoreAppBackup: push had conflicts");
        }
      }
    }
  }

  window.location.reload();
}
