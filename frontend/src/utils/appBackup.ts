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
import { ANONYMOUS_USER_STATE_OWNER, USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
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
import { getPreferenceOwner, withPreferenceLock } from "@/utils/preferenceStorage";
import { logger } from "@/utils/logger";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/timeTracking/types";
import type { Label } from "@/lib/timeTracking/constants";
import { isValidRawGanttTask } from "@/types/gantt";
import { isLabelInput } from "@/lib/timeTracking/constants";
import { isValidTimeString } from "@/lib/timeTracking/timeUtils";
import { isValidEntryType, isValidFlag } from "@/lib/timeOff/types";
import { hasIsoAlpha2Format } from "@/types/countries";
import type { GanttTask } from "@/types/gantt";
import type { WorkLocationEntry } from "@/types/workLocation";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { isValidScheduleType } from "@/utils/scheduleUtils";

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
    ...(task.ganttTaskId ? { ganttTaskId: task.ganttTaskId } : {}),
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
    ...(task.label ? { label: task.label } : {}),
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
    if (typeof userState === "object" && userState !== null && !Array.isArray(userState)) {
      const { _accountOwner: _owner, ...preferences } = userState as Record<string, unknown>;
      payload.userState = preferences;
    } else if (userState !== undefined) payload.userState = userState;
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
  return getAppBackupValidationError(parsed) === undefined;
}

/** Load reference targets only when restoring collection data, never preferences alone. */
export async function preloadAppBackupCollections(payload: unknown): Promise<void> {
  if (
    isRecord(payload) &&
    ["tasks", "templates", "labels", "ganttTasks", "timeOff", "workLocations"].some(
      (section) => section in payload,
    )
  ) {
    await preloadSyncCollections();
  }
}

/** Returns a section and one-based record position, never imported diagnostic text. */
export function getAppBackupValidationError(
  parsed: unknown,
): { section: string; record: number } | undefined {
  const fail = (section: string, record = 0) => ({ section, record });
  if (!isRecord(parsed) || parsed.version !== 1) return fail("version");
  const sections = [
    "userState",
    "timeOff",
    "workLocations",
    "tasks",
    "templates",
    "labels",
    "ganttTasks",
  ];
  if (!sections.some((section) => section in parsed)) return fail("version");
  if ("exportedAt" in parsed && typeof parsed.exportedAt !== "string") return fail("version");
  if ("userState" in parsed) {
    const state = parsed.userState;
    if (
      !isRecord(state) ||
      (state.scheduleType != null && !isValidScheduleType(state.scheduleType))
    )
      return fail("userState");
    for (const key of [
      "hasCompletedOnboarding",
      "accountSyncAnnouncementSeen",
      "ganttAnnouncementSeen",
      "crossBorderAnnouncementSeen",
    ]) {
      if (key in state && typeof state[key] !== "boolean") return fail("userState");
    }
    if (
      state.myTeam != null &&
      (!Number.isInteger(state.myTeam) || Number(state.myTeam) < 1 || Number(state.myTeam) > 5)
    )
      return fail("userState");
    for (const key of ["settings", "lastUsed"]) {
      if (key in state && !isRecord(state[key])) return fail("userState");
    }
    if (isRecord(state.settings)) {
      for (const [key, value] of Object.entries(state.settings)) {
        if (key.startsWith("enable") && typeof value !== "boolean") return fail("userState");
      }
    }
  }
  for (const section of ["tasks", "templates", "labels", "ganttTasks", "timeOff"] as const) {
    if (!(section in parsed)) continue;
    const rows = parsed[section];
    if (!Array.isArray(rows)) return fail(section);
    const ids = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (!isRecord(row) || !nonempty(row.id) || ids.has(row.id)) return fail(section, index + 1);
      ids.add(row.id);
      let valid = false;
      switch (section) {
        case "tasks":
          valid =
            typeof row.text === "string" &&
            typeof row.label === "string" &&
            validTimestamp(row.startTime) &&
            (row.stopTime == null ||
              (validTimestamp(row.stopTime) &&
                Date.parse(row.stopTime) >= Date.parse(row.startTime as string))) &&
            (row.includesBreak === undefined || typeof row.includesBreak === "boolean") &&
            (row.ganttTaskId === undefined || nonempty(row.ganttTaskId));
          break;
        case "templates":
          valid =
            typeof row.text === "string" &&
            typeof row.label === "string" &&
            isValidTimeString(row.start) &&
            isValidTimeString(row.stop);
          break;
        case "labels":
          valid = isLabelInput(row);
          break;
        case "ganttTasks":
          valid = isValidRawGanttTask(row) && typeof row.progress === "number";
          break;
        case "timeOff":
          valid =
            isValidEntryType(row.entryType) &&
            isValidFlag(row.entryFlag) &&
            (row.note === null || typeof row.note === "string") &&
            (row.entryKind === "date"
              ? validDate(row.date)
              : row.entryKind === "range"
                ? validDate(row.start) && validDate(row.end) && row.end >= row.start
                : row.entryKind === "weekly" &&
                  Number.isInteger(row.weekday) &&
                  Number(row.weekday) >= 1 &&
                  Number(row.weekday) <= 7);
          break;
      }
      if (!valid) return fail(section, index + 1);
    }
  }
  if ("workLocations" in parsed) {
    if (!isRecord(parsed.workLocations)) return fail("workLocations");
    for (const [year, days] of Object.entries(parsed.workLocations)) {
      if (!/^\d{4}$/.test(year) || !isRecord(days)) return fail("workLocations");
      for (const [index, [date, entry]] of Object.entries(days).entries()) {
        if (
          !validDate(date) ||
          !date.startsWith(year + "-") ||
          !isRecord(entry) ||
          !hasIsoAlpha2Format(entry.countryCode) ||
          (entry.label !== undefined && typeof entry.label !== "string")
        )
          return fail("workLocations", index + 1);
      }
    }
  }
  // Omitted target domains retain their current local records. Included domains
  // replace them entirely, including an explicit empty array. Never drop a link.
  const labels = new Set(
    ((parsed.labels ?? labelsCollection.toArray) as Label[]).map((row) => row.id),
  );
  const gantt = (parsed.ganttTasks ?? ganttTasksCollection.toArray) as GanttTask[];
  const ganttIds = new Set(gantt.map((row) => row.id));
  for (const section of ["tasks", "templates", "ganttTasks"] as const) {
    const retained = {
      tasks: tasksCollection,
      templates: templatesCollection,
      ganttTasks: ganttTasksCollection,
    };
    const rows = (parsed[section] ??
      ("labels" in parsed || "ganttTasks" in parsed ? retained[section].toArray : undefined)) as
      | Record<string, unknown>[]
      | undefined;
    for (const [index, row] of (rows ?? []).entries()) {
      if (
        (row.label && !labels.has(row.label as string)) ||
        (section === "tasks" && row.ganttTaskId && !ganttIds.has(row.ganttTaskId as string)) ||
        (section === "ganttTasks" &&
          typeof row.dependencies === "string" &&
          row.dependencies
            .split(",")
            .some((id) => id.trim() && (!ganttIds.has(id.trim()) || id.trim() === row.id)))
      )
        return fail(section, index + 1);
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs(value, "YYYY-MM-DD", true).format("YYYY-MM-DD") === value
  );
}
function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    validDate(value.slice(0, 10)) &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
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
 * state stays in place on sync failure (already durably written). Invalid
 * backups instead throw during preflight, before any restore writes. If the pre-push
 * server pull fails, nothing is queued — there is no server snapshot to diff
 * against, so there is no way to compute which server-only records the
 * replace should delete, and queuing a create-only payload would silently
 * drop those deletes. If the push itself fails outright after a successful
 * pull, the full replace payload (including its deletes and its
 * `allow_bulk_delete` opt-in) is queued in the sync outbox for the next
 * successful sync cycle; a partial per-record conflict is not queued, since
 * re-sending already-accepted records is redundant and the conflicted ones
 * would just conflict again. Either way, callers should surface an error and
 * must distinguish validation failures from sync failures. Does not throw for a
 * backup that restores no collection data
 * (nothing to push).
 */
export async function restoreAppBackup(
  payload: AppBackupPayload,
  fetchFn?: FetchFn,
): Promise<void> {
  // Complete preflight before preferences or any collection can be replaced.
  await preloadAppBackupCollections(payload);
  if (!validateAppBackupPayload(payload)) throw new Error("Invalid app backup");
  if (
    payload.userState !== undefined &&
    typeof payload.userState === "object" &&
    payload.userState !== null
  ) {
    const restorePreferences = () => {
      const { _accountOwner: _sourceOwner, ...preferences } = payload.userState as Record<
        string,
        unknown
      >;
      // A backup carries preferences, not the source account's ownership.
      const destinationOwner =
        getSyncCollectionUserId() ?? getPreferenceOwner() ?? ANONYMOUS_USER_STATE_OWNER;
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          ...preferences,
          _accountOwner: destinationOwner,
          // Restoring a backup is the newest preference intent on this device.
          _updatedAt: new Date().toISOString(),
        }),
      );
    };
    if (typeof navigator.locks?.request === "function")
      await withPreferenceLock(restorePreferences);
    else restorePreferences();
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
    const localPayload = buildLocalSyncPushPayload();
    // Included empty domains still need server-only deletes. Preferences alone
    // do not require a domain reconciliation.
    if (Object.values(includedDomains).some(Boolean)) {
      const serverData = await pullSyncData(fetchFn);
      if (!serverData) {
        // No server snapshot to diff against, so there is no way to compute
        // which server-only records this replace should delete. Queuing the
        // create-only localPayload instead would silently drop those
        // deletes, so surface the failure and leave nothing queued — the
        // already-written local state is untouched either way.
        throw new Error("restoreAppBackup: failed to pull server data before push");
      }
      const fullReplacePayload = buildKeepLocalReplacePayload(localPayload, serverData, {
        allowEmpty: true,
      });
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
