/**
 * TanStack DB collection stubs for sync-managed domains.
 *
 * Each collection uses `localOnlyCollectionOptions` (in-memory, zero side
 * effects) as temporary scaffolding. These stubs establish the collection ID
 * and item type so the rest of the codebase can reference them before the
 * full migration wires up the pull/push endpoints.
 *
 * When migrating a domain:
 * 1. Replace `localOnlyCollectionOptions` with a QueryCollection
 *    (@tanstack/query-db-collection):
 *    - `queryFn`  → GET /api/sync/pull?since=<cursor>
 *    - `onInsert` / `onUpdate` / `onDelete` → POST /api/sync/push
 * 2. Wire SSE direct writes: on `sync_changed` from useSyncSignal, call the
 *    collection's direct write API instead of triggering a full refetch.
 * 3. Decide offline queuing: QueryCollection rolls back failed mutations but
 *    does not persist them for retry. Either enqueue failures to the existing
 *    outbox or accept re-entry on reconnect.
 * 4. Replace usages of the legacy hook with `useLiveQuery` over the collection.
 * 5. Remove the legacy hook.
 * 6. Update the status comment below from `pending` to `migrated`.
 *
 * Do NOT add a standalone useQuery alongside a QueryCollection for the same
 * domain — that creates a competing cache.
 */

import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import type { GanttTask } from "@/types/gantt";
import type { WorkLocationEntry } from "@/types/workLocation";

// ---------------------------------------------------------------------------
// Time-tracking labels
// Status: pending — still managed by the labels hooks in EventStoreContext.
// ---------------------------------------------------------------------------

export const labelsCollection = createCollection(
  localOnlyCollectionOptions<TimeTrackingLabel>({
    id: "worktime/labels",
    getKey: (label) => label.id,
  }),
);

// ---------------------------------------------------------------------------
// Time-tracking tasks
// Status: pending — still managed by the tasks hooks in EventStoreContext.
// ---------------------------------------------------------------------------

export const tasksCollection = createCollection(
  localOnlyCollectionOptions<StoredTimeTrackingTask>({
    id: "worktime/tasks",
    getKey: (task) => task.id,
  }),
);

// ---------------------------------------------------------------------------
// Time-tracking templates
// Status: pending — still managed by the templates hooks in EventStoreContext.
// ---------------------------------------------------------------------------

export const templatesCollection = createCollection(
  localOnlyCollectionOptions<TimeTrackingTemplate>({
    id: "worktime/templates",
    getKey: (template) => template.id,
  }),
);

// ---------------------------------------------------------------------------
// Time-off entries
// Status: pending — still managed by EventStoreContext / loadTimeOffEntries.
// ---------------------------------------------------------------------------

export const timeOffCollection = createCollection(
  localOnlyCollectionOptions<TimeOffEntry>({
    id: "worktime/time-off-entries",
    getKey: (entry) => entry.id,
  }),
);

// ---------------------------------------------------------------------------
// Gantt tasks
// Status: pending — still managed by GanttContext.
// ---------------------------------------------------------------------------

export const ganttTasksCollection = createCollection(
  localOnlyCollectionOptions<GanttTask>({
    id: "worktime/gantt-tasks",
    getKey: (task) => task.id,
  }),
);

// ---------------------------------------------------------------------------
// Work locations
// Status: pending — stored per-year under WORK_LOCATIONS_STORAGE_PREFIX.
//
// The existing localStorage layout stores locations per-year
// (e.g. "worktime_work_locations_2026"). The QueryCollection migration must
// flatten this into a single collection keyed by date. A data-format migration
// will be needed for existing stored values.
// ---------------------------------------------------------------------------

export const workLocationsCollection = createCollection(
  localOnlyCollectionOptions<WorkLocationEntry>({
    id: "worktime/work-locations",
    getKey: (entry) => entry.date,
  }),
);
