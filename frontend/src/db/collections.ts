/**
 * TanStack DB QueryCollection definitions for all sync-managed domains.
 *
 * Each collection uses `queryCollectionOptions` from
 * `@tanstack/query-db-collection` to bridge TanStack Query's fetch lifecycle
 * with TanStack DB:
 *
 *   queryFn  → GET /api/sync/pull      (full fetch on first mount)
 *   onInsert → POST /api/sync/push     (single create)
 *   onUpdate → POST /api/sync/push     (single update)
 *   onDelete → POST /api/sync/push     (single delete)
 *
 * **Offline mutation queuing (Option A)**
 * QueryCollection applies optimistic mutations immediately. If a push fails
 * (network error, server error) the optimistic state is kept and the payload
 * is enqueued into the per-user outbox (`worktime_sync_outbox_<userId>`).
 * The outbox is flushed on the next successful sync cycle, preserving existing
 * offline guarantees.
 *
 * **Auth wiring**
 * Collections need the current user ID (for the outbox key). Call
 * `setSyncCollectionAuth(userId)` from `OngoingSyncProvider` whenever auth
 * changes.
 *
 * **SSE direct writes**
 * When `sync_changed` fires, `onIncrementalPull` in `OngoingSyncContext` calls
 * `applyIncrementalPullToCollections(data)` which uses the direct-write API
 * (`utils.writeUpsert` / `utils.writeDelete`) to apply server data without
 * triggering new push operations.
 *
 * Do NOT add a standalone useQuery alongside a QueryCollection for the same
 * domain — that creates a competing cache.
 */

import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { queryClient } from "@/lib/queryClient";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { createTimeOffEntry } from "@/lib/timeOff/codecs";
import { isValidEntryType, isValidFlag } from "@/lib/timeOff/types";
import type { GanttTask } from "@/types/gantt";
import type { WorkLocationEntry } from "@/types/workLocation";
import {
  appendToSyncOutbox,
  type GanttTaskSyncRead,
  type LabelSyncRead,
  type SyncPullResponse,
  type SyncPushPayload,
  type TaskSyncRead,
  type TemplateSyncRead,
  type TimeOffEntrySyncRead,
  type WorkLocationSyncRead,
} from "@/utils/syncClient";
import { dayjs } from "@/utils/dateTimeUtils";

// ---------------------------------------------------------------------------
// Module-level auth state — set by setSyncCollectionAuth
// ---------------------------------------------------------------------------

let _currentUserId: string | null = null;
let _currentAccessToken: string | null = null;

/**
 * Update the auth context used by collection mutation handlers.
 *
 * Must be called whenever the user's authentication state changes — typically
 * from `OngoingSyncProvider`.
 */
export function setSyncCollectionAuth(userId: string | null, accessToken: string | null = null): void {
  if (_currentUserId === userId && _currentAccessToken === accessToken) {
    return;
  }
  _currentUserId = userId;
  _currentAccessToken = accessToken;
  // QueryCollections use staleTime=Infinity, so an auth transition from
  // "unknown" to "authenticated" would otherwise leave already-mounted
  // collections stuck on their initial empty snapshot until some later local
  // mutation or manual refresh forces a pull.
  void queryClient.invalidateQueries({ queryKey: ["sync"] });
}

export function hasSyncCollectionAuth(): boolean {
  return _currentUserId !== null;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

/**
 * Perform a fetch request against the configured sync API base URL.
 * Injects the OIDC Bearer token when one is available.
 */
async function collectionFetch(url: string, init?: RequestInit): Promise<Response> {
  const fullUrl =
    typeof window === "undefined" ? url : new URL(url, window.location.origin).toString();
  const headers = new Headers(init?.headers);
  if (_currentAccessToken) {
    headers.set("Authorization", `Bearer ${_currentAccessToken}`);
  }
  return fetch(fullUrl, { ...init, headers });
}

/**
 * Push a single-domain sync payload to the server.
 * On failure (network error or non-ok response), enqueues to the per-user
 * outbox so the change is retried on the next sync flush.
 *
 * Does NOT throw — the caller (onInsert/onUpdate/onDelete) keeps the optimistic
 * update regardless of push outcome (Option A offline strategy).
 */
async function pushAndQueue(payload: SyncPushPayload): Promise<void> {
  // No authenticated sync user: keep the local optimistic write only.
  // This is expected in local-only mode and in tests that exercise collection
  // mutations without mounting OngoingSyncProvider.
  if (!_currentUserId) {
    return;
  }

  try {
    const response = await collectionFetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`sync push failed: ${response.status}`);
    }
  } catch {
    // Push failed — enqueue to outbox for retry on next sync cycle.
    appendToSyncOutbox(_currentUserId, payload);
  }
}

// ---------------------------------------------------------------------------
// Pull-response → local format converters
// ---------------------------------------------------------------------------

/** Convert UTC ISO-8601 datetime to local "YYYY-MM-DDTHH:mm" string. */
function utcIsoToLocalTime(utcIso: string): string {
  return dayjs(utcIso).format("YYYY-MM-DDTHH:mm");
}

// ---------------------------------------------------------------------------
// Public helpers for applying a full or incremental pull to all collections
// ---------------------------------------------------------------------------

/**
 * Apply a full sync pull response to all collections via direct writes,
 * replacing every collection's contents with the server state.
 *
 * Intended for:
 *  - First-sync Branch B (server has data, local empty)
 *  - Conflict resolution "use-server" path
 *
 * Uses direct writes (`utils.writeUpsert` / `utils.writeDelete`) so that no
 * push handlers fire and no server round-trip is triggered.
 */
/**
 * Run a batch write only when there are actual operations to perform.
 *
 * Calling `collection.utils.writeBatch(...)` throws `SyncNotInitializedError`
 * if the collection has not been started yet (e.g. the component that mounts
 * it isn't rendered in the current test / environment). Skip the batch safely
 * when the operation set is empty, and start the collection if needed when
 * there are real writes to apply.
 */
export function runWriteBatch<T extends { utils: { writeBatch: (cb: () => void) => void } }>(
  collection: T,
  hasWork: boolean,
  callback: () => void,
): void {
  if (!hasWork) return;
  // Ensure the collection is started so that writeBatch can access its sync context.
  (collection as unknown as { startSyncImmediate: () => void }).startSyncImmediate();
  collection.utils.writeBatch(callback);
}

export function replaceCollectionContents<
  TItem,
  TKey extends string,
  TCollection extends {
    toArray: TItem[];
    has: (key: TKey) => boolean;
    delete: (key: TKey) => void;
    insert: (item: TItem) => void;
    utils: {
      writeBatch: (cb: () => void) => void;
      writeDelete: (keys: TKey[]) => void;
      writeInsert: (items: TItem[]) => void;
    };
  },
>(collection: TCollection, nextItems: TItem[], getKey: (item: TItem) => TKey): void {
  const existingKeys = collection.toArray.map(getKey);

  // During first sync there is no configured sync auth yet. Use normal local
  // mutations instead of direct-write batches so collection replacement works
  // without starting sync machinery for unmounted collections.
  if (!_currentUserId) {
    for (const key of existingKeys) {
      if (collection.has(key)) {
        collection.delete(key);
      }
    }
    for (const item of nextItems) {
      collection.insert(item);
    }
    return;
  }

  runWriteBatch(collection, existingKeys.length > 0 || nextItems.length > 0, () => {
    if (existingKeys.length > 0) collection.utils.writeDelete(existingKeys);
    if (nextItems.length > 0) collection.utils.writeInsert(nextItems);
  });
}

export function applyPullToCollections(data: SyncPullResponse): void {
  // Labels
  replaceCollectionContents(
    labelsCollection,
    data.labels.filter((l) => l.deleted_at === null).map(syncLabelToLabel),
    (label) => label.id,
  );

  // Tasks
  replaceCollectionContents(
    tasksCollection,
    data.tasks.filter((t) => t.deleted_at === null).map(syncTaskToStoredTask),
    (task) => task.id,
  );

  // Templates
  replaceCollectionContents(
    templatesCollection,
    data.templates.filter((t) => t.deleted_at === null).map(syncTemplateToTemplate),
    (template) => template.id,
  );

  // Work locations
  replaceCollectionContents(
    workLocationsCollection,
    data.work_locations.filter((wl) => wl.deleted_at === null).map(syncWorkLocationToEntry),
    (entry) => entry.date,
  );

  // Time-off entries
  replaceCollectionContents(
    timeOffCollection,
    _syncItemsToTimeOffEntries(data.time_off_entries ?? []),
    (entry) => entry.id,
  );

  // Gantt tasks
  replaceCollectionContents(
    ganttTasksCollection,
    (data.gantt_tasks ?? []).filter((g) => g.deleted_at === null).map(syncGanttTaskToGanttTask),
    (task) => task.id,
  );
}

/**
 * Apply an incremental sync pull response to all collections, merging server
 * changes (upserts and deletes) into the existing collection state.
 *
 * Intended for the ongoing-sync incremental pull path (triggered by SSE or
 * periodic polling).
 */
export function applyIncrementalPullToCollections(data: SyncPullResponse): void {
  // Labels
  const labelUpserts = data.labels.filter((l) => l.deleted_at === null).map(syncLabelToLabel);
  const labelDeletes = data.labels.filter((l) => l.deleted_at !== null).map((l) => l.id);
  runWriteBatch(labelsCollection, labelDeletes.length > 0 || labelUpserts.length > 0, () => {
    if (labelDeletes.length > 0) labelsCollection.utils.writeDelete(labelDeletes);
    if (labelUpserts.length > 0) labelsCollection.utils.writeUpsert(labelUpserts);
  });

  // Tasks
  const taskUpserts = data.tasks.filter((t) => t.deleted_at === null).map(syncTaskToStoredTask);
  const taskDeletes = data.tasks.filter((t) => t.deleted_at !== null).map((t) => t.id);
  runWriteBatch(tasksCollection, taskDeletes.length > 0 || taskUpserts.length > 0, () => {
    if (taskDeletes.length > 0) tasksCollection.utils.writeDelete(taskDeletes);
    if (taskUpserts.length > 0) tasksCollection.utils.writeUpsert(taskUpserts);
  });

  // Templates
  const templateUpserts = data.templates
    .filter((t) => t.deleted_at === null)
    .map(syncTemplateToTemplate);
  const templateDeletes = data.templates.filter((t) => t.deleted_at !== null).map((t) => t.id);
  runWriteBatch(
    templatesCollection,
    templateDeletes.length > 0 || templateUpserts.length > 0,
    () => {
      if (templateDeletes.length > 0) templatesCollection.utils.writeDelete(templateDeletes);
      if (templateUpserts.length > 0) templatesCollection.utils.writeUpsert(templateUpserts);
    },
  );

  // Work locations
  const wlUpserts = data.work_locations
    .filter((wl) => wl.deleted_at === null)
    .map(syncWorkLocationToEntry);
  const wlDeletes = data.work_locations.filter((wl) => wl.deleted_at !== null).map((wl) => wl.date);
  runWriteBatch(workLocationsCollection, wlDeletes.length > 0 || wlUpserts.length > 0, () => {
    if (wlDeletes.length > 0) workLocationsCollection.utils.writeDelete(wlDeletes);
    if (wlUpserts.length > 0) workLocationsCollection.utils.writeUpsert(wlUpserts);
  });

  // Time-off entries
  const timeOffUpserts = _syncItemsToTimeOffEntries(
    (data.time_off_entries ?? []).filter((e) => e.deleted_at === null),
  );
  const timeOffDeletes = (data.time_off_entries ?? [])
    .filter((e) => e.deleted_at !== null)
    .map((e) => e.entry_id);
  runWriteBatch(timeOffCollection, timeOffDeletes.length > 0 || timeOffUpserts.length > 0, () => {
    if (timeOffDeletes.length > 0) timeOffCollection.utils.writeDelete(timeOffDeletes);
    if (timeOffUpserts.length > 0) timeOffCollection.utils.writeUpsert(timeOffUpserts);
  });

  // Gantt tasks
  const ganttUpserts = (data.gantt_tasks ?? [])
    .filter((g) => g.deleted_at === null)
    .map(syncGanttTaskToGanttTask);
  const ganttDeletes = (data.gantt_tasks ?? [])
    .filter((g) => g.deleted_at !== null)
    .map((g) => g.id);
  runWriteBatch(ganttTasksCollection, ganttDeletes.length > 0 || ganttUpserts.length > 0, () => {
    if (ganttDeletes.length > 0) ganttTasksCollection.utils.writeDelete(ganttDeletes);
    if (ganttUpserts.length > 0) ganttTasksCollection.utils.writeUpsert(ganttUpserts);
  });
}

// ---------------------------------------------------------------------------
// Internal sync-item → domain-type converters
// ---------------------------------------------------------------------------

function syncLabelToLabel(l: LabelSyncRead): TimeTrackingLabel {
  return { id: l.id, name: l.name, color: l.color };
}

function syncTaskToStoredTask(t: TaskSyncRead): StoredTimeTrackingTask {
  const task: StoredTimeTrackingTask = {
    id: t.id,
    text: t.text,
    label: t.label_id ?? "",
    ganttTaskId: t.gantt_task_id ?? undefined,
    startTime: utcIsoToLocalTime(t.start_time),
    stopTime: t.stop_time ? utcIsoToLocalTime(t.stop_time) : undefined,
  };
  if (t.includes_break) task.includesBreak = true;
  return task;
}

function syncTemplateToTemplate(t: TemplateSyncRead): TimeTrackingTemplate {
  return {
    id: t.id,
    text: t.text,
    label: t.label_id ?? "",
    start: t.start_time.slice(0, 5),
    stop: t.stop_time.slice(0, 5),
  };
}

function syncWorkLocationToEntry(wl: WorkLocationSyncRead): WorkLocationEntry {
  return {
    date: wl.date,
    countryCode: wl.country_code as WorkLocationEntry["countryCode"],
    ...(wl.label ? { label: wl.label } : {}),
  };
}

function syncGanttTaskToGanttTask(g: GanttTaskSyncRead): GanttTask {
  return {
    id: g.id,
    name: g.name,
    start: g.start_date,
    end: g.end_date,
    progress: g.progress,
    ...(g.label_id ? { label: g.label_id } : {}),
    ...(g.dependencies ? { dependencies: g.dependencies } : {}),
    ...(g.notes ? { notes: g.notes } : {}),
  };
}

function _syncItemsToTimeOffEntries(items: TimeOffEntrySyncRead[]): TimeOffEntry[] {
  const results: TimeOffEntry[] = [];
  for (const item of items) {
    if (item.deleted_at !== null) continue;
    const entryType = isValidEntryType(item.entry_type) ? item.entry_type : "other";
    const entryFlag = isValidFlag(item.entry_flag) ? item.entry_flag : "full_day";
    if (item.entry_kind === "date" && item.date != null) {
      results.push(
        createTimeOffEntry({
          id: item.entry_id,
          entryKind: "date",
          date: item.date,
          entryType,
          entryFlag,
          note: item.note,
        }),
      );
    } else if (item.entry_kind === "range" && item.start_date != null && item.end_date != null) {
      results.push(
        createTimeOffEntry({
          id: item.entry_id,
          entryKind: "range",
          start: item.start_date,
          end: item.end_date,
          entryType,
          entryFlag,
          note: item.note,
        }),
      );
    } else if (item.entry_kind === "weekly" && item.weekday != null) {
      results.push(
        createTimeOffEntry({
          id: item.entry_id,
          entryKind: "weekly",
          weekday: item.weekday,
          entryType,
          entryFlag,
          note: item.note,
        }),
      );
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Time-tracking labels — migrated
// ---------------------------------------------------------------------------

export const labelsCollection = createCollection(
  queryCollectionOptions<TimeTrackingLabel>({
    id: "worktime/labels",
    queryKey: ["sync", "labels"],
    queryClient,
    getKey: (label) => label.id,
    staleTime: Infinity,
    queryFn: async (): Promise<TimeTrackingLabel[]> => {
      if (!_currentUserId) return labelsCollection.toArray as TimeTrackingLabel[];
      const response = await collectionFetch("/api/sync/pull");
      if (!response.ok) return [];
      const data = (await response.json()) as SyncPullResponse;
      return data.labels.filter((l) => l.deleted_at === null).map(syncLabelToLabel);
    },
    onInsert: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "create",
          client_updated_at: now,
          name: m.modified.name,
          color: m.modified.color,
        })),
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onUpdate: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "update",
          client_updated_at: now,
          name: m.modified.name,
          color: m.modified.color,
        })),
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onDelete: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: transaction.mutations.map((m) => ({
          id: m.original.id,
          action: "delete",
          client_updated_at: now,
        })),
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
  }),
);

// ---------------------------------------------------------------------------
// Time-tracking tasks — migrated
// ---------------------------------------------------------------------------

export const tasksCollection = createCollection(
  queryCollectionOptions<StoredTimeTrackingTask>({
    id: "worktime/tasks",
    queryKey: ["sync", "tasks"],
    queryClient,
    getKey: (task) => task.id,
    staleTime: Infinity,
    queryFn: async (): Promise<StoredTimeTrackingTask[]> => {
      if (!_currentUserId) return tasksCollection.toArray as StoredTimeTrackingTask[];
      const response = await collectionFetch("/api/sync/pull");
      if (!response.ok) return [];
      const data = (await response.json()) as SyncPullResponse;
      return data.tasks.filter((t) => t.deleted_at === null).map(syncTaskToStoredTask);
    },
    onInsert: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "create",
          client_updated_at: now,
          label_id: m.modified.label || null,
          gantt_task_id: m.modified.ganttTaskId || null,
          text: m.modified.text,
          start_time: dayjs(m.modified.startTime).toISOString(),
          stop_time: m.modified.stopTime ? dayjs(m.modified.stopTime).toISOString() : null,
          includes_break: m.modified.includesBreak ?? false,
        })),
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onUpdate: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "update",
          client_updated_at: now,
          label_id: m.modified.label || null,
          gantt_task_id: m.modified.ganttTaskId || null,
          text: m.modified.text,
          start_time: dayjs(m.modified.startTime).toISOString(),
          stop_time: m.modified.stopTime ? dayjs(m.modified.stopTime).toISOString() : null,
          includes_break: m.modified.includesBreak ?? false,
        })),
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onDelete: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: transaction.mutations.map((m) => ({
          id: m.original.id,
          action: "delete",
          client_updated_at: now,
        })),
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
  }),
);

// ---------------------------------------------------------------------------
// Time-tracking templates — migrated
// ---------------------------------------------------------------------------

export const templatesCollection = createCollection(
  queryCollectionOptions<TimeTrackingTemplate>({
    id: "worktime/templates",
    queryKey: ["sync", "templates"],
    queryClient,
    getKey: (template) => template.id,
    staleTime: Infinity,
    queryFn: async (): Promise<TimeTrackingTemplate[]> => {
      if (!_currentUserId) return templatesCollection.toArray as TimeTrackingTemplate[];
      const response = await collectionFetch("/api/sync/pull");
      if (!response.ok) return [];
      const data = (await response.json()) as SyncPullResponse;
      return data.templates.filter((t) => t.deleted_at === null).map(syncTemplateToTemplate);
    },
    onInsert: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "create",
          client_updated_at: now,
          label_id: m.modified.label || null,
          text: m.modified.text,
          start_time: `${m.modified.start}:00`,
          stop_time: `${m.modified.stop}:00`,
        })),
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onUpdate: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "update",
          client_updated_at: now,
          label_id: m.modified.label || null,
          text: m.modified.text,
          start_time: `${m.modified.start}:00`,
          stop_time: `${m.modified.stop}:00`,
        })),
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onDelete: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: transaction.mutations.map((m) => ({
          id: m.original.id,
          action: "delete",
          client_updated_at: now,
        })),
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
  }),
);

// ---------------------------------------------------------------------------
// Time-off entries — migrated
// ---------------------------------------------------------------------------

export const timeOffCollection = createCollection(
  queryCollectionOptions<TimeOffEntry>({
    id: "worktime/time-off-entries",
    queryKey: ["sync", "time-off-entries"],
    queryClient,
    getKey: (entry) => entry.id,
    staleTime: Infinity,
    queryFn: async (): Promise<TimeOffEntry[]> => {
      if (!_currentUserId) return timeOffCollection.toArray as TimeOffEntry[];
      const response = await collectionFetch("/api/sync/pull");
      if (!response.ok) return [];
      const data = (await response.json()) as SyncPullResponse;
      return _syncItemsToTimeOffEntries(data.time_off_entries ?? []);
    },
    onInsert: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: transaction.mutations.map((m) => {
          const entry = m.modified;
          return {
            id: entry.id,
            action: "create",
            client_updated_at: now,
            entry_kind: entry.entryKind,
            date: entry.entryKind === "date" ? entry.date : null,
            start_date: entry.entryKind === "range" ? entry.start : null,
            end_date: entry.entryKind === "range" ? entry.end : null,
            weekday: entry.entryKind === "weekly" ? entry.weekday : null,
            entry_type: entry.entryType,
            entry_flag: entry.entryFlag,
            note: entry.note ?? null,
          };
        }),
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onUpdate: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: transaction.mutations.map((m) => {
          const entry = m.modified;
          return {
            id: entry.id,
            action: "update",
            client_updated_at: now,
            entry_kind: entry.entryKind,
            date: entry.entryKind === "date" ? entry.date : null,
            start_date: entry.entryKind === "range" ? entry.start : null,
            end_date: entry.entryKind === "range" ? entry.end : null,
            weekday: entry.entryKind === "weekly" ? entry.weekday : null,
            entry_type: entry.entryType,
            entry_flag: entry.entryFlag,
            note: entry.note ?? null,
          };
        }),
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onDelete: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: transaction.mutations.map((m) => ({
          id: m.original.id,
          action: "delete",
          client_updated_at: now,
        })),
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
  }),
);

// ---------------------------------------------------------------------------
// Gantt tasks — migrated
// ---------------------------------------------------------------------------

export const ganttTasksCollection = createCollection(
  queryCollectionOptions<GanttTask>({
    id: "worktime/gantt-tasks",
    queryKey: ["sync", "gantt-tasks"],
    queryClient,
    getKey: (task) => task.id,
    staleTime: Infinity,
    queryFn: async (): Promise<GanttTask[]> => {
      if (!_currentUserId) return ganttTasksCollection.toArray as GanttTask[];
      const response = await collectionFetch("/api/sync/pull");
      if (!response.ok) return [];
      const data = (await response.json()) as SyncPullResponse;
      return (data.gantt_tasks ?? [])
        .filter((g) => g.deleted_at === null)
        .map(syncGanttTaskToGanttTask);
    },
    onInsert: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "create",
          client_updated_at: now,
          name: m.modified.name,
          label_id: m.modified.label ?? null,
          start_date: m.modified.start,
          end_date: m.modified.end,
          progress: m.modified.progress,
          dependencies: m.modified.dependencies ?? null,
          notes: m.modified.notes ?? null,
        })),
      };
      await pushAndQueue(payload);
    },
    onUpdate: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: transaction.mutations.map((m) => ({
          id: m.modified.id,
          action: "update",
          client_updated_at: now,
          name: m.modified.name,
          label_id: m.modified.label ?? null,
          start_date: m.modified.start,
          end_date: m.modified.end,
          progress: m.modified.progress,
          dependencies: m.modified.dependencies ?? null,
          notes: m.modified.notes ?? null,
        })),
      };
      await pushAndQueue(payload);
    },
    onDelete: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: [],
        gantt_tasks: transaction.mutations.map((m) => ({
          id: m.original.id,
          action: "delete",
          client_updated_at: now,
        })),
      };
      await pushAndQueue(payload);
    },
  }),
);

// ---------------------------------------------------------------------------
// Work locations — migrated
//
// The collection is keyed by date (YYYY-MM-DD). The backend sync schema only
// stores `country_code` and `label`; when restoring from the server, entries
// are written with `location: "other"` as a safe default (the home/office
// distinction is derived at display time from user settings).
// ---------------------------------------------------------------------------

export const workLocationsCollection = createCollection(
  queryCollectionOptions<WorkLocationEntry>({
    id: "worktime/work-locations",
    queryKey: ["sync", "work-locations"],
    queryClient,
    getKey: (entry) => entry.date,
    staleTime: Infinity,
    queryFn: async (): Promise<WorkLocationEntry[]> => {
      if (!_currentUserId) return workLocationsCollection.toArray as WorkLocationEntry[];
      const response = await collectionFetch("/api/sync/pull");
      if (!response.ok) return [];
      const data = (await response.json()) as SyncPullResponse;
      return data.work_locations
        .filter((wl) => wl.deleted_at === null)
        .map(syncWorkLocationToEntry);
    },
    onInsert: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: transaction.mutations.map((m) => ({
          date: m.modified.date,
          action: "create",
          client_updated_at: now,
          country_code: m.modified.countryCode,
          label: m.modified.label ?? null,
        })),
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onUpdate: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: transaction.mutations.map((m) => ({
          date: m.modified.date,
          action: "update",
          client_updated_at: now,
          country_code: m.modified.countryCode,
          label: m.modified.label ?? null,
        })),
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
    onDelete: async ({ transaction }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: transaction.mutations.map((m) => ({
          date: m.original.date,
          action: "delete",
          client_updated_at: now,
        })),
        time_off_entries: [],
        gantt_tasks: [],
      };
      await pushAndQueue(payload);
    },
  }),
);
