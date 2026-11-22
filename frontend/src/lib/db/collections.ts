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

import { updateSyncCollectionSession } from "@/lib/db/collectionTransport";
import { ganttTasksCollection } from "@/lib/db/ganttTasksCollection";
import { labelsCollection } from "@/lib/db/labelsCollection";
import {
  hydrateSyncCollections,
  purgeSnapshotsOnOwnerChange,
  startPersistingSyncCollections,
  type PersistableCollection,
} from "@/lib/db/persistence";
import { tasksCollection } from "@/lib/db/tasksCollection";
import { templatesCollection } from "@/lib/db/templatesCollection";
import { timeOffCollection } from "@/lib/db/timeOffCollection";
import { workLocationsCollection } from "@/lib/db/workLocationsCollection";
import { logger } from "@/lib/logger";
import { queryClient } from "@/lib/query/queryClient";
import { drainPendingSyncOutbox } from "@/lib/sync/syncOutbox";
import type { TimeOffEntry } from "@/lib/time-off/types";
import type { Label } from "@/lib/time-tracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/time-tracking/types";
import type { GanttTask } from "@/types/gantt";
import type { WorkLocationEntry } from "@/types/workLocation";

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
  const sessionChange = updateSyncCollectionSession(userId, accessToken);
  if (!sessionChange) return;
  const { previousUserId } = sessionChange;
  const userChanged = previousUserId !== userId;

  // Move any writes made before this user was known into their real outbox,
  // synchronously and before anything below can pull server state — a pull
  // response with no record of those writes would otherwise silently
  // overwrite the still-unsynced optimistic rows. Only relevant on the
  // null -> known transition, since that is the only state pending writes
  // can have accumulated under.
  if (previousUserId === null && userId !== null) {
    drainPendingSyncOutbox(userId);
  }

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
  await Promise.all(Object.values(syncCollections).map((collection) => collection.preload()));
}

/** True when every sync-backed collection has finished its initial load. */
export function areSyncCollectionsReady(): boolean {
  return Object.values(syncCollections).every((collection) => collection.isReady());
}
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

export {
  acceptTaskConflictServerState,
  applyIncrementalPullToCollections,
  applyPullToCollections,
  mergeCollectionContents,
  mergePullIntoCollections,
  replaceCollectionContents,
  runMutationBatch,
  runWriteBatch,
} from "@/lib/db/collectionPull";
export {
  getSyncCollectionUserId,
  hasSyncCollectionAuth,
  setSyncCollectionAuthResolving,
  setSyncCollectionTriggerPull,
} from "@/lib/db/collectionTransport";
export { ganttTasksCollection } from "@/lib/db/ganttTasksCollection";
export { labelsCollection } from "@/lib/db/labelsCollection";
export { tasksCollection } from "@/lib/db/tasksCollection";
export { templatesCollection } from "@/lib/db/templatesCollection";
export { pushTimeOffImport, timeOffCollection } from "@/lib/db/timeOffCollection";
export {
  reassignAndDeleteLabel,
  replaceTimeTrackingSettings,
} from "@/lib/db/timeTrackingSettingsMutations";
export { workLocationsCollection } from "@/lib/db/workLocationsCollection";
