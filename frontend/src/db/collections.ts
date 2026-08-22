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
import {
  getLoadedSnapshot,
  hydrateSyncCollections,
  purgeSnapshotsOnOwnerChange,
  startPersistingSyncCollections,
  whenHydrated,
  type PersistableCollection,
} from "@/db/persistence";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/timeTracking/types";
import type { Label } from "@/lib/timeTracking/constants";
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
import { logger } from "@/utils/logger";

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
  const previousUserId = _currentUserId;
  const userChanged = previousUserId !== userId;
  _currentUserId = userId;
  _currentAccessToken = accessToken;

  if (userChanged) {
    // The persisted cache is one per-device store. If it belongs to a
    // different account, drop it — both so the new user is not shown the
    // previous one's records, and so the first-sync flow does not read them as
    // "local data" to upload into the new account. Signing *in* from anonymous
    // is exempt: that data is the signing-in user's own.
    const liveRowsBelongToPreviousUser = previousUserId !== null;
    void purgeSnapshotsOnOwnerChange(userId, Object.keys(SYNC_COLLECTIONS))
      .then((purged) => {
        if (purged || liveRowsBelongToPreviousUser) {
          // Query-cache removal does not clear QueryCollection.toArray. Reload
          // so no live row from the previous owner can be returned by a failed
          // pull or observed while the new account starts. A signed-in user
          // transition always reloads, even if storage was unavailable.
          window.location.reload();
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["sync"] });
      })
      .catch((err: unknown) => {
        logger.error("Failed to prepare sync snapshots for an owner change:", err);
        if (liveRowsBelongToPreviousUser) {
          window.location.reload();
          return;
        }
        // No previous signed-in user's live rows exist; keep the initial
        // anonymous → signed-in transition retryable.
        void queryClient.invalidateQueries({ queryKey: ["sync"] });
      });
    return;
  }

  // QueryCollections use staleTime=Infinity, so an auth transition from
  // "unknown" to "authenticated" would otherwise leave already-mounted
  // collections stuck on their initial empty snapshot until some later local
  // mutation or manual refresh forces a pull.
  void queryClient.invalidateQueries({ queryKey: ["sync"] });
}

export function hasSyncCollectionAuth(): boolean {
  return _currentUserId !== null;
}

/** The current signed-in sync user's id, or null when not signed in. */
export function getSyncCollectionUserId(): string | null {
  return _currentUserId;
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
 * Fetch the full sync snapshot for the signed-in user.
 *
 * Throws on any non-ok response so TanStack Query keeps the collection's last
 * good data and retries.  Returning `[]` here instead (as this used to) makes
 * a expired token, a 502 during a deploy, or any other transient server error
 * indistinguishable from "this account has no records": every collection
 * empties out, the user is shown an app with their history apparently wiped,
 * and — worse — anything that reads `collection.toArray` as the local truth
 * (see `buildLocalSyncPushPayload`) would treat that empty snapshot as the
 * state to replicate back to the server.
 */
async function fetchSyncSnapshot(): Promise<SyncPullResponse> {
  const response = await collectionFetch("/api/sync/pull");
  if (!response.ok) {
    throw new Error(`sync pull failed: ${response.status}`);
  }
  return (await response.json()) as SyncPullResponse;
}

/**
 * Fetch a collection's server rows, falling back to its persisted snapshot.
 *
 * TanStack Query keeps the last good data when a refetch throws, which covers
 * a *warm* failure. It cannot cover a cold start: after a reload there is no
 * last-good data in memory, so an unreachable server (offline, a deploy, an
 * expired token) would render an empty app over a full local history. The
 * snapshot is that history, so it is what the user sees until the server is
 * reachable again.
 *
 * Rethrows when there is no snapshot — an error keeps the collection empty and
 * retrying, which is honest, where returning `[]` would assert the account is
 * empty.
 */
async function fetchWithSnapshotFallback<T>(
  name: string,
  select: (data: SyncPullResponse) => T[],
  current: () => T[],
): Promise<T[]> {
  try {
    return select(await fetchSyncSnapshot());
  } catch (err) {
    // What the collection already holds beats the snapshot: the snapshot is
    // the cold-start seed, frozen at load, while the collection includes
    // everything written since. Returning the snapshot over a populated
    // collection would roll back the user's offline edits on screen — they
    // are still queued in the outbox and would come back on the next
    // successful pull, but watching entries vanish is exactly the "the app
    // lost my work" moment this is all meant to prevent.
    const live = current();
    if (live.length > 0) {
      logger.error(`sync pull for "${name}" failed; keeping the current local rows:`, err);
      return live;
    }
    const snapshot = getLoadedSnapshot<T>(name);
    if (snapshot) {
      logger.error(`sync pull for "${name}" failed; showing the last saved copy:`, err);
      return snapshot;
    }
    throw err;
  }
}

interface SnapshotBackedCollection<T> {
  readonly toArray: T[];
}

async function syncQueryFn<T>(
  name: string,
  collection: SnapshotBackedCollection<T>,
  select: (data: SyncPullResponse) => T[],
): Promise<T[]> {
  await whenHydrated();
  const current = () => collection.toArray;
  if (!_currentUserId) {
    const items = current();
    return items.length > 0 ? items : (getLoadedSnapshot<T>(name) ?? items);
  }
  return fetchWithSnapshotFallback(name, select, current);
}

/**
 * Every collection backed by the sync API, in no particular order.
 *
 * Declared as a getter rather than a module-level array because the
 * collections are defined further down this file.
 */
function allSyncCollections() {
  return [
    labelsCollection,
    tasksCollection,
    templatesCollection,
    timeOffCollection,
    ganttTasksCollection,
    workLocationsCollection,
  ];
}

/**
 * Wait until every sync-backed collection has loaded its initial data.
 *
 * Collections start lazily, when a component that reads them first renders, so
 * `collection.toArray` on a collection nobody has mounted yet is empty — and
 * indistinguishable from a genuinely empty collection.  Any code path that
 * treats local state as the truth to push (the first-sync flow) must await this
 * first, or it can ask the server to delete records that only *look* absent.
 *
 * Rejects if any collection fails to load, so callers can refuse to proceed
 * rather than acting on a partial picture.
 */
export async function preloadSyncCollections(): Promise<void> {
  await Promise.all(allSyncCollections().map((collection) => collection.preload()));
}

/** True when every sync-backed collection has finished its initial load. */
export function areSyncCollectionsReady(): boolean {
  return allSyncCollections().every((collection) => collection.isReady());
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
interface StartableCollection {
  startSyncImmediate(): void;
}

interface DirectWriteCollection extends StartableCollection {
  utils: { writeBatch: (callback: () => void) => void };
}

export function runWriteBatch<T extends DirectWriteCollection>(
  collection: T,
  hasWork: boolean,
  callback: () => void,
): void {
  if (!hasWork) return;
  // Ensure the collection is started so that writeBatch can access its sync context.
  collection.startSyncImmediate();
  collection.utils.writeBatch(callback);
}

/** Run ordinary optimistic mutations through their collection handlers. */
export function runMutationBatch<T extends StartableCollection>(
  collection: T,
  hasWork: boolean,
  callback: () => void,
): void {
  if (!hasWork) return;
  collection.startSyncImmediate();
  callback();
}

export function replaceCollectionContents<
  TItem,
  TKey extends string,
  TCollection extends {
    startSyncImmediate: () => void;
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

function syncLabelToLabel(l: LabelSyncRead): Label {
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
  queryCollectionOptions<Label>({
    id: "worktime/labels",
    queryKey: ["sync", "labels"],
    queryClient,
    getKey: (label) => label.id,
    staleTime: Infinity,
    queryFn: (): Promise<Label[]> =>
      syncQueryFn("labels", labelsCollection, (data) =>
        data.labels.filter((l) => l.deleted_at === null).map(syncLabelToLabel),
      ),
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
    queryFn: (): Promise<StoredTimeTrackingTask[]> =>
      syncQueryFn("tasks", tasksCollection, (data) =>
        data.tasks.filter((t) => t.deleted_at === null).map(syncTaskToStoredTask),
      ),
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
    queryFn: (): Promise<TimeTrackingTemplate[]> =>
      syncQueryFn("templates", templatesCollection, (data) =>
        data.templates.filter((t) => t.deleted_at === null).map(syncTemplateToTemplate),
      ),
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
    queryFn: (): Promise<TimeOffEntry[]> =>
      syncQueryFn("time-off-entries", timeOffCollection, (data) =>
        _syncItemsToTimeOffEntries(data.time_off_entries ?? []),
      ),
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
    queryFn: (): Promise<GanttTask[]> =>
      syncQueryFn("gantt-tasks", ganttTasksCollection, (data) =>
        (data.gantt_tasks ?? []).filter((g) => g.deleted_at === null).map(syncGanttTaskToGanttTask),
      ),
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
    queryFn: (): Promise<WorkLocationEntry[]> =>
      syncQueryFn("work-locations", workLocationsCollection, (data) =>
        data.work_locations.filter((wl) => wl.deleted_at === null).map(syncWorkLocationToEntry),
      ),
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

// ---------------------------------------------------------------------------
// Local persistence
// ---------------------------------------------------------------------------

/**
 * The sync-backed collections by snapshot name.
 *
 * Names are stable storage keys — renaming one orphans that collection's
 * snapshot and the next reload looks like data loss for that domain.
 */
const syncCollections = {
  labels: labelsCollection,
  tasks: tasksCollection,
  templates: templatesCollection,
  "time-off-entries": timeOffCollection,
  "gantt-tasks": ganttTasksCollection,
  "work-locations": workLocationsCollection,
};

export const SYNC_COLLECTIONS = syncCollections as unknown as Record<
  string,
  PersistableCollection<never>
>;

const SYNC_COLLECTION_KEYS = {
  labels: (item: unknown) => (item as Label).id,
  tasks: (item: unknown) => (item as StoredTimeTrackingTask).id,
  templates: (item: unknown) => (item as TimeTrackingTemplate).id,
  "time-off-entries": (item: unknown) => (item as TimeOffEntry).id,
  "gantt-tasks": (item: unknown) => (item as GanttTask).id,
  "work-locations": (item: unknown) => (item as WorkLocationEntry).date,
} satisfies Record<keyof typeof syncCollections, (item: unknown) => string>;

function getSyncCollectionItemKey(collectionName: string, item: unknown): string {
  const getKey = SYNC_COLLECTION_KEYS[collectionName as keyof typeof SYNC_COLLECTION_KEYS];
  if (!getKey) throw new Error(`Missing snapshot key function for "${collectionName}"`);
  return getKey(item);
}

/**
 * Seed the collections from their IndexedDB snapshots and keep persisting.
 *
 * Called once during app startup, before anything reads a collection. Every
 * `queryFn` awaits `whenHydrated()`, so a slow hydration delays the first fetch
 * rather than racing it.
 */
// Started at module load, not from an app entry point: a collection can be
// queried the moment anything imports this module, and `whenHydrated()` only
// blocks a queryFn if the hydration promise already exists. Registering it any
// later leaves a window where the first query resolves against an unloaded
// snapshot and commits an empty collection.
const hydrationStarted =
  typeof indexedDB === "undefined"
    ? Promise.resolve()
    : hydrateSyncCollections(Object.keys(SYNC_COLLECTIONS));

/**
 * Begin persisting collection changes to IndexedDB.
 *
 * Hydration has already started by the time this runs (see above); this only
 * attaches the change subscriptions, which nothing depends on for ordering.
 */
export function initSyncCollectionPersistence(): Promise<void> {
  startPersistingSyncCollections(SYNC_COLLECTIONS, getSyncCollectionItemKey);
  return hydrationStarted;
}
