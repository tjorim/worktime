import { dayjs } from "@/lib/dates/dateTimeUtils";
import {
  ganttTasksCollection,
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  workLocationsCollection,
} from "@/lib/db/collections";
import type { TimeOffEntry } from "@/lib/time-off/types";
import type { Label } from "@/lib/time-tracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/time-tracking/types";
import { isValidRawGanttTask, type RawGanttTask } from "@/types/gantt";
import type { WorkLocationEntry } from "@/types/workLocation";

import type {
  GanttTaskSyncItem,
  LabelSyncItem,
  SyncPullResponse,
  SyncPushPayload,
  TaskSyncItem,
  TemplateSyncItem,
  TimeOffEntrySyncItem,
  WorkLocationSyncItem,
} from "@/api-types";
import { timeOffEntriesToSyncItems } from "@/lib/sync/timeOffSyncItems";

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
 * Throws `EmptyLocalReplaceError` when `localPayload` holds nothing at all,
 * unless a confirmed backup restore explicitly opts into `allowEmpty`.
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
  options?: { allowEmpty: boolean },
): SyncPushPayload {
  if (!options?.allowEmpty && isEmptyPushPayload(localPayload)) {
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
/** Detect stored rows omitted by upload validation before replacing local collections. */
export function localSyncPayloadIsComplete(payload: SyncPushPayload): boolean {
  return [
    [labelsCollection.toArray, payload.labels],
    [tasksCollection.toArray, payload.tasks],
    [templatesCollection.toArray, payload.templates],
    [workLocationsCollection.toArray, payload.work_locations],
    [timeOffCollection.toArray, payload.time_off_entries],
    [ganttTasksCollection.toArray, payload.gantt_tasks],
  ].every(([stored, pushed]) => stored!.length === pushed!.length);
}

/** Compare identities and all pushed content, including tombstones; counts alone are insufficient. */
export function syncDatasetsMatch(local: SyncPushPayload, server: SyncPullResponse): boolean {
  const keys = [
    "labels",
    "tasks",
    "templates",
    "work_locations",
    "time_off_entries",
    "gantt_tasks",
  ] as const;
  return keys.every((key) => {
    const remote = server[key] ?? [];
    return (
      local[key].length === remote.length &&
      local[key].every((item) => {
        const localRecord = item as unknown as Record<string, unknown>;
        const identityField = key === "work_locations" ? "date" : "id";
        const remoteIdentityField = key === "time_off_entries" ? "entry_id" : identityField;
        const match = remote.find(
          (record) =>
            (record as unknown as Record<string, unknown>)[remoteIdentityField] ===
            localRecord[identityField],
        );
        if (!match || (item.action === "delete") !== Boolean(match.deleted_at)) return false;
        return Object.entries(item).every(([field, value]) => {
          if (field === "action" || field === "client_updated_at" || field === identityField)
            return true;
          if (key === "tasks" && (field === "start_time" || field === "stop_time")) {
            const remoteValue = (match as unknown as Record<string, unknown>)[field];
            if (typeof value === "string" && typeof remoteValue === "string") {
              return Date.parse(value) === Date.parse(remoteValue);
            }
          }
          return (
            JSON.stringify(value) ===
            JSON.stringify((match as unknown as Record<string, unknown>)[field])
          );
        });
      })
    );
  });
}
