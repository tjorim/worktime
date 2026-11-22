import type { SyncPullResponse, SyncPushPayload } from "@/api-types";
import { getSyncCollectionUserId } from "@/lib/db/collectionTransport";
import { ganttTasksCollection, syncGanttTaskToGanttTask } from "@/lib/db/ganttTasksCollection";
import { labelsCollection, syncLabelToLabel } from "@/lib/db/labelsCollection";
import { syncTaskToStoredTask, tasksCollection } from "@/lib/db/tasksCollection";
import { syncTemplateToTemplate, templatesCollection } from "@/lib/db/templatesCollection";
import { syncItemsToTimeOffEntries, timeOffCollection } from "@/lib/db/timeOffCollection";
import { syncWorkLocationToEntry, workLocationsCollection } from "@/lib/db/workLocationsCollection";

// ---------------------------------------------------------------------------
// Public helpers for applying a full or incremental pull to all collections
// ---------------------------------------------------------------------------

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
      writeUpsert: (items: TItem[]) => void;
    };
  },
>(collection: TCollection, nextItems: TItem[], getKey: (item: TItem) => TKey): void {
  const existingKeys = collection.toArray.map(getKey);

  // During first sync there is no configured sync auth yet. Use normal local
  // mutations instead of direct-write batches so collection replacement works
  // without starting sync machinery for unmounted collections.
  if (!getSyncCollectionUserId()) {
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

  const nextKeys = new Set(nextItems.map(getKey));
  const removedKeys = existingKeys.filter((key) => !nextKeys.has(key));

  runWriteBatch(collection, removedKeys.length > 0 || nextItems.length > 0, () => {
    // TanStack Query DB rejects multiple operations for the same key within a
    // writeBatch. Deleting every existing row and then inserting the merged
    // snapshot therefore fails whenever a local row is also present in the
    // server response (the normal keep-both case). Delete only rows absent
    // from the snapshot and upsert the snapshot itself.
    if (removedKeys.length > 0) collection.utils.writeDelete(removedKeys);
    if (nextItems.length > 0) collection.utils.writeUpsert(nextItems);
  });
}

export function mergeCollectionContents<
  TItem,
  TCollection extends {
    startSyncImmediate: () => void;
    utils: { writeBatch: (cb: () => void) => void; writeUpsert: (items: TItem[]) => void };
  },
>(collection: TCollection, items: TItem[]): void {
  runWriteBatch(collection, items.length > 0, () => collection.utils.writeUpsert(items));
}

/** Remove conflicted tasks that the refreshed server snapshot does not contain. */
export function acceptTaskConflictServerState(
  payload: SyncPushPayload,
  data: SyncPullResponse,
): void {
  const serverGanttIds = new Set(
    data.gantt_tasks.filter((task) => task.deleted_at === null).map((task) => task.id),
  );
  const discardedGanttIds = payload.gantt_tasks
    .filter((task) => !serverGanttIds.has(task.id) && ganttTasksCollection.has(task.id))
    .map((task) => task.id);
  runWriteBatch(ganttTasksCollection, discardedGanttIds.length > 0, () =>
    ganttTasksCollection.utils.writeDelete(discardedGanttIds),
  );
  const serverIds = new Set(
    data.tasks.filter((task) => task.deleted_at === null).map((task) => task.id),
  );
  const discardedIds = payload.tasks
    .filter((task) => !serverIds.has(task.id) && tasksCollection.has(task.id))
    .map((task) => task.id);
  runWriteBatch(tasksCollection, discardedIds.length > 0, () =>
    tasksCollection.utils.writeDelete(discardedIds),
  );
}

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
    syncItemsToTimeOffEntries(data.time_off_entries ?? []),
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
 * Merge a full server snapshot into the local collections without deleting
 * anything that exists only on this device.
 *
 * This is intentionally narrower than applyPullToCollections: first-sync's
 * "keep everything" choice promises a union, so absence from the snapshot is
 * not evidence that a local row should be removed. Per-record push conflicts
 * are preserved separately in the outbox for the existing conflict resolver.
 */
export function mergePullIntoCollections(data: SyncPullResponse): void {
  mergeCollectionContents(
    labelsCollection,
    data.labels.filter((item) => item.deleted_at === null).map(syncLabelToLabel),
  );
  mergeCollectionContents(
    tasksCollection,
    data.tasks.filter((item) => item.deleted_at === null).map(syncTaskToStoredTask),
  );
  mergeCollectionContents(
    templatesCollection,
    data.templates.filter((item) => item.deleted_at === null).map(syncTemplateToTemplate),
  );
  mergeCollectionContents(
    workLocationsCollection,
    data.work_locations.filter((item) => item.deleted_at === null).map(syncWorkLocationToEntry),
  );
  mergeCollectionContents(
    timeOffCollection,
    syncItemsToTimeOffEntries(data.time_off_entries ?? []),
  );
  mergeCollectionContents(
    ganttTasksCollection,
    (data.gantt_tasks ?? [])
      .filter((item) => item.deleted_at === null)
      .map(syncGanttTaskToGanttTask),
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
  const timeOffUpserts = syncItemsToTimeOffEntries(
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
