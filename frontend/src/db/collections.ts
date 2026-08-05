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
 * **Local persistence**
 * Every collection is additionally wrapped in `persistedCollectionOptions`, so
 * its rows are written to and hydrated from a local SQLite store as part of the
 * sync commit — see `@/db/persistence`. The practical consequence for this file
 * is that a collection reaches "ready" asynchronously: use `runWriteBatch` for
 * direct writes (it waits) and `runMutationBatch` for ordinary local mutations
 * (it does not need to).
 *
 * Do NOT add a standalone useQuery alongside a QueryCollection for the same
 * domain — that creates a competing cache.
 */

import { createCollection } from "@tanstack/react-db";
import { persistedCollectionOptions } from "@tanstack/browser-db-sqlite-persistence";
import { queryCollectionOptions, type QueryCollectionUtils } from "@tanstack/query-db-collection";
import { queryClient } from "@/lib/queryClient";
import {
  COLLECTION_SCHEMA_VERSION,
  guardStartupMarkReady,
  purgePersistedDataOnOwnerChange,
  syncCollectionPersistence,
  whenPersistenceReady,
} from "@/db/persistence";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { Label } from "@/components/timeTracking/constants";
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

/**
 * The key type `queryCollectionOptions` settles on for these collections.
 *
 * Every collection here is keyed by a string, but the option builder widens to
 * its `string | number` default rather than narrowing from `getKey`, and the
 * two type arguments have to agree for the wrapper below to accept the spread.
 */
type CollectionKey = string | number;

/**
 * The direct-write utils a query collection contributes to the wrapped options.
 *
 * Named because `persistedCollectionOptions` has to be called with all four of
 * its type arguments or none: supplying the item type alone (which is needed —
 * inference through its intersection option type collapses the item to
 * `Record<string, unknown>`) also forces `TUtils`, and the default there is a
 * bare `UtilsRecord`. That silently drops `writeBatch` / `writeUpsert` /
 * `writeDelete`, which the SSE and first-sync paths are built on.
 */
type SyncCollectionUtils<T extends object> = QueryCollectionUtils<T, CollectionKey, T>;

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
export function setSyncCollectionAuth(
  userId: string | null,
  accessToken: string | null = null,
): void {
  if (_currentUserId === userId && _currentAccessToken === accessToken) {
    return;
  }
  const userChanged = _currentUserId !== userId;
  _currentUserId = userId;
  _currentAccessToken = accessToken;

  if (userChanged) {
    // The persisted store is one per-device store. If it belongs to a
    // different account, drop it — both so the new user is not shown the
    // previous one's records, and so the first-sync flow does not read them as
    // "local data" to upload into the new account. Signing *in* from anonymous
    // is exempt: that data is the signing-in user's own.
    void prepareSyncCollectionsForOwner(userId).then((ready) => {
      if (ready) void queryClient.invalidateQueries({ queryKey: ["sync"] });
    });
    return;
  }

  // QueryCollections use staleTime=Infinity, so an auth transition from
  // "unknown" to "authenticated" would otherwise leave already-mounted
  // collections stuck on their initial empty snapshot until some later local
  // mutation or manual refresh forces a pull.
  void queryClient.invalidateQueries({ queryKey: ["sync"] });
}

/**
 * Ensure persisted rows belong to this owner before any sync flow reads them.
 *
 * Returns false when a reload was required. Both auth setup and first sync call
 * this function; the persistence layer deduplicates their concurrent request.
 */
export async function prepareSyncCollectionsForOwner(userId: string | null): Promise<boolean> {
  const purged = await purgePersistedDataOnOwnerChange(userId);
  if (!purged) return true;

  // Purging closes the SQLite database, and the previous account's rows are
  // still in the in-memory collections. Reloading is the only way to be sure
  // neither survives; clearing the query cache alone would leave both.
  window.location.reload();
  return false;
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
 * Fetch a collection's server rows, falling back to what is already local.
 *
 * TanStack Query keeps the last good data when a refetch throws, which covers
 * a *warm* failure. It cannot cover a cold start: after a reload there is no
 * last-good data in memory, so an unreachable server (offline, a deploy, an
 * expired token) would render an empty app over a full local history. The
 * persistence layer hydrates that history back into the collection, so
 * returning the collection's own rows is what keeps them on screen until the
 * server is reachable again.
 *
 * Rethrows when the collection is empty — an error keeps it empty and retrying,
 * which is honest, where returning `[]` would assert the account is empty and
 * be replicated back to the server as a delete-everything.
 */
async function fetchWithLocalFallback<T>(
  name: string,
  select: (data: SyncPullResponse) => T[],
  current: () => T[],
): Promise<T[]> {
  try {
    return select(await fetchSyncSnapshot());
  } catch (err) {
    // Returning the persisted rows over a populated collection would roll back
    // the user's offline edits on screen — they are still queued in the outbox
    // and would come back on the next successful pull, but watching entries
    // vanish is exactly the "the app lost my work" moment this is all meant to
    // prevent. The collection already holds both: the hydrated rows and
    // everything written since.
    const live = current();
    if (live.length > 0) {
      logger.error(`sync pull for "${name}" failed; keeping the current local rows:`, err);
      return live;
    }
    throw err;
  }
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
 * Batches queued against a collection that was not ready yet, newest last.
 *
 * Keyed by collection so writes to one domain cannot be reordered behind a
 * slower one, and weak so a collection is not retained by its own queue.
 */
const deferredWriteBatches = new WeakMap<object, Promise<void>>();

interface BatchableCollection {
  utils: { writeBatch: (cb: () => void) => void };
}

/** The lifecycle surface `createCollection` provides but does not type publicly. */
function lifecycleOf(collection: BatchableCollection) {
  return collection as unknown as {
    startSyncImmediate: () => void;
    isReady: () => boolean;
    preload: () => Promise<void>;
  };
}

/**
 * Run a batch of *direct writes* (`utils.writeUpsert` / `writeDelete` /
 * `writeInsert`) only when there are actual operations to perform.
 *
 * The direct-write API needs a collection in the "ready" state, and readiness
 * is asynchronous now that the collections are persisted: the wrapper hydrates
 * from the local store before marking a collection ready, so on a cold start a
 * server write can arrive first. Rather than throw that write away, queue it
 * behind `preload()` — per collection, so batches still land in call order.
 *
 * Every caller is a server-driven path (an incremental pull, a first-sync
 * apply) that is already asynchronous, so the deferral is not observable. Use
 * `runMutationBatch` for batches of ordinary local mutations, which must stay
 * synchronous because the UI reads them back on the next render.
 */
export function runWriteBatch<T extends BatchableCollection>(
  collection: T,
  hasWork: boolean,
  callback: () => void,
): void {
  if (!hasWork) return;
  // Ensure the collection is started so that writeBatch can access its sync context.
  const lifecycle = lifecycleOf(collection);
  lifecycle.startSyncImmediate();
  if (lifecycle.isReady()) {
    collection.utils.writeBatch(callback);
    return;
  }

  const queued = (deferredWriteBatches.get(collection) ?? Promise.resolve())
    .then(() => lifecycle.preload())
    .then(() => {
      collection.utils.writeBatch(callback);
    })
    .catch((err: unknown) => {
      logger.error("Deferred collection write failed:", err);
    });
  deferredWriteBatches.set(collection, queued);
}

/**
 * Group a set of ordinary local mutations (`insert` / `update` / `delete`) into
 * one transaction, so they produce a single push instead of one per row.
 *
 * Unlike `runWriteBatch` this never defers. These are user actions — the UI
 * reads the result back on the very next render — and plain mutations do not
 * need the manual-sync context that `writeBatch` requires, so before the
 * collection is ready the callback simply runs ungrouped. The mutations all
 * still apply; they just push individually.
 */
export function runMutationBatch<T extends BatchableCollection>(
  collection: T,
  hasWork: boolean,
  callback: () => void,
): void {
  if (!hasWork) return;
  const lifecycle = lifecycleOf(collection);
  lifecycle.startSyncImmediate();
  if (lifecycle.isReady()) {
    collection.utils.writeBatch(callback);
    return;
  }
  callback();
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
  guardStartupMarkReady(
    persistedCollectionOptions<Label, CollectionKey, never, SyncCollectionUtils<Label>>({
      ...queryCollectionOptions<Label>({
        id: "worktime/labels",
        queryKey: ["sync", "labels"],
        queryClient,
        getKey: (label) => label.id,
        staleTime: Infinity,
        queryFn: async (): Promise<Label[]> => {
          await whenPersistenceReady();
          if (!_currentUserId) {
            // Local-only: nothing to pull, and the persistence layer writes the
            // previous session's rows into the collection itself. Echoing the
            // collection back is what stops this result from truncating them.
            return labelsCollection.toArray as Label[];
          }
          return fetchWithLocalFallback(
            "labels",
            (data) => data.labels.filter((l) => l.deleted_at === null).map(syncLabelToLabel),
            () => labelsCollection.toArray as Label[],
          );
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
      persistence: syncCollectionPersistence,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
  ),
);

// ---------------------------------------------------------------------------
// Time-tracking tasks — migrated
// ---------------------------------------------------------------------------

export const tasksCollection = createCollection(
  guardStartupMarkReady(
    persistedCollectionOptions<
      StoredTimeTrackingTask,
      CollectionKey,
      never,
      SyncCollectionUtils<StoredTimeTrackingTask>
    >({
      ...queryCollectionOptions<StoredTimeTrackingTask>({
        id: "worktime/tasks",
        queryKey: ["sync", "tasks"],
        queryClient,
        getKey: (task) => task.id,
        staleTime: Infinity,
        queryFn: async (): Promise<StoredTimeTrackingTask[]> => {
          await whenPersistenceReady();
          if (!_currentUserId) {
            // Local-only: nothing to pull, and the persistence layer writes the
            // previous session's rows into the collection itself. Echoing the
            // collection back is what stops this result from truncating them.
            return tasksCollection.toArray as StoredTimeTrackingTask[];
          }
          return fetchWithLocalFallback(
            "tasks",
            (data) => data.tasks.filter((t) => t.deleted_at === null).map(syncTaskToStoredTask),
            () => tasksCollection.toArray as StoredTimeTrackingTask[],
          );
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
      persistence: syncCollectionPersistence,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
  ),
);

// ---------------------------------------------------------------------------
// Time-tracking templates — migrated
// ---------------------------------------------------------------------------

export const templatesCollection = createCollection(
  guardStartupMarkReady(
    persistedCollectionOptions<
      TimeTrackingTemplate,
      CollectionKey,
      never,
      SyncCollectionUtils<TimeTrackingTemplate>
    >({
      ...queryCollectionOptions<TimeTrackingTemplate>({
        id: "worktime/templates",
        queryKey: ["sync", "templates"],
        queryClient,
        getKey: (template) => template.id,
        staleTime: Infinity,
        queryFn: async (): Promise<TimeTrackingTemplate[]> => {
          await whenPersistenceReady();
          if (!_currentUserId) {
            // Local-only: nothing to pull, and the persistence layer writes the
            // previous session's rows into the collection itself. Echoing the
            // collection back is what stops this result from truncating them.
            return templatesCollection.toArray as TimeTrackingTemplate[];
          }
          return fetchWithLocalFallback(
            "templates",
            (data) =>
              data.templates.filter((t) => t.deleted_at === null).map(syncTemplateToTemplate),
            () => templatesCollection.toArray as TimeTrackingTemplate[],
          );
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
      persistence: syncCollectionPersistence,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
  ),
);

// ---------------------------------------------------------------------------
// Time-off entries — migrated
// ---------------------------------------------------------------------------

export const timeOffCollection = createCollection(
  guardStartupMarkReady(
    persistedCollectionOptions<
      TimeOffEntry,
      CollectionKey,
      never,
      SyncCollectionUtils<TimeOffEntry>
    >({
      ...queryCollectionOptions<TimeOffEntry>({
        id: "worktime/time-off-entries",
        queryKey: ["sync", "time-off-entries"],
        queryClient,
        getKey: (entry) => entry.id,
        staleTime: Infinity,
        queryFn: async (): Promise<TimeOffEntry[]> => {
          await whenPersistenceReady();
          if (!_currentUserId) {
            // Local-only: nothing to pull, and the persistence layer writes the
            // previous session's rows into the collection itself. Echoing the
            // collection back is what stops this result from truncating them.
            return timeOffCollection.toArray as TimeOffEntry[];
          }
          return fetchWithLocalFallback(
            "time-off-entries",
            (data) => _syncItemsToTimeOffEntries(data.time_off_entries ?? []),
            () => timeOffCollection.toArray as TimeOffEntry[],
          );
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
      persistence: syncCollectionPersistence,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
  ),
);

// ---------------------------------------------------------------------------
// Gantt tasks — migrated
// ---------------------------------------------------------------------------

export const ganttTasksCollection = createCollection(
  guardStartupMarkReady(
    persistedCollectionOptions<GanttTask, CollectionKey, never, SyncCollectionUtils<GanttTask>>({
      ...queryCollectionOptions<GanttTask>({
        id: "worktime/gantt-tasks",
        queryKey: ["sync", "gantt-tasks"],
        queryClient,
        getKey: (task) => task.id,
        staleTime: Infinity,
        queryFn: async (): Promise<GanttTask[]> => {
          await whenPersistenceReady();
          if (!_currentUserId) {
            // Local-only: nothing to pull, and the persistence layer writes the
            // previous session's rows into the collection itself. Echoing the
            // collection back is what stops this result from truncating them.
            return ganttTasksCollection.toArray as GanttTask[];
          }
          return fetchWithLocalFallback(
            "gantt-tasks",
            (data) =>
              (data.gantt_tasks ?? [])
                .filter((g) => g.deleted_at === null)
                .map(syncGanttTaskToGanttTask),
            () => ganttTasksCollection.toArray as GanttTask[],
          );
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
      persistence: syncCollectionPersistence,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
  ),
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
  guardStartupMarkReady(
    persistedCollectionOptions<
      WorkLocationEntry,
      CollectionKey,
      never,
      SyncCollectionUtils<WorkLocationEntry>
    >({
      ...queryCollectionOptions<WorkLocationEntry>({
        id: "worktime/work-locations",
        queryKey: ["sync", "work-locations"],
        queryClient,
        getKey: (entry) => entry.date,
        staleTime: Infinity,
        queryFn: async (): Promise<WorkLocationEntry[]> => {
          await whenPersistenceReady();
          if (!_currentUserId) {
            // Local-only: nothing to pull, and the persistence layer writes the
            // previous session's rows into the collection itself. Echoing the
            // collection back is what stops this result from truncating them.
            return workLocationsCollection.toArray as WorkLocationEntry[];
          }
          return fetchWithLocalFallback(
            "work-locations",
            (data) =>
              data.work_locations
                .filter((wl) => wl.deleted_at === null)
                .map(syncWorkLocationToEntry),
            () => workLocationsCollection.toArray as WorkLocationEntry[],
          );
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
      persistence: syncCollectionPersistence,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
  ),
);

// ---------------------------------------------------------------------------
// Local persistence
// ---------------------------------------------------------------------------

/**
 * Open the local store so the collections can hydrate from it.
 *
 * `persistedCollectionOptions` drives hydration itself — it runs the persisted
 * startup before it even calls the query collection's sync — so this only
 * starts the OPFS/SQLite open early rather than leaving the first collection
 * to pay for it. Every `queryFn` awaits `whenPersistenceReady()` regardless, so
 * a slow open delays the first fetch instead of racing it.
 */
export function initSyncCollectionPersistence(): Promise<void> {
  return whenPersistenceReady();
}
