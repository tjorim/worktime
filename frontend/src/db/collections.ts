/**
 * TanStack DB collection definitions for sync-managed domains.
 *
 * ## Ownership boundary
 *
 * TanStack DB is authoritative for sync-managed user data once migrated.
 * TanStack Query (useQuery) must NOT be used for these domains.
 * See `docs/realtime-sync-architecture.md` §Data Ownership Boundaries for details.
 *
 * ## Rollout status
 *
 * Each collection below is marked with its current migration status:
 *
 * - `pending`   — domain still lives in localStorage behind existing hooks; TanStack DB not yet active.
 * - `migrated`  — domain has been moved to TanStack DB; localStorage hooks are removed.
 *
 * During rollout, only `migrated` collections are live. A `pending` collection
 * is a placeholder that establishes the data contract and key mapping so that
 * issue #515 can activate it without touching unrelated code.
 *
 * ## Adding a migrated collection
 *
 * When migrating a domain in issue #515:
 * 1. Replace `localOnlyCollectionOptions` with `localStorageCollectionOptions` (or a custom
 *    sync adapter if the existing localStorage format needs migration).
 * 2. Wire up `onInsert`, `onUpdate`, and `onDelete` handlers to call the sync outbox.
 * 3. Remove the corresponding localStorage-backed hook (e.g. `useTimeTrackingLabels`).
 * 4. Update the collection status comment from `pending` to `migrated`.
 * 5. Do NOT add a `useQuery` call for the same domain — that would create a redundant cache.
 */

import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import type { GanttTask } from "@/types/gantt";

// ---------------------------------------------------------------------------
// Time-tracking labels
// Status: pending — still managed by the labels hooks in EventStoreContext.
// Target localStorage key: TIME_TRACKING_STORAGE_KEYS.labels
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
// Target localStorage key: TIME_TRACKING_STORAGE_KEYS.tasks
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
// Target localStorage key: TIME_TRACKING_STORAGE_KEYS.templates
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
// Target localStorage key: TIME_OFF_ENTRIES_STORAGE_KEY
// ---------------------------------------------------------------------------

export const timeOffCollection = createCollection(
  localOnlyCollectionOptions<TimeOffEntry>({
    id: "worktime/time-off-entries",
    getKey: (entry) => entry.id,
  }),
);

// ---------------------------------------------------------------------------
// Gantt tasks
// Status: pending — still managed by GanttContext / GANTT_STORAGE_KEY.
// Target localStorage key: GANTT_STORAGE_KEY
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
// NOTE: Work locations use a multi-key per-year layout in localStorage
// (e.g. "worktime_work_locations_2026"). Migrating to TanStack DB requires
// a custom sync adapter or a data layout change. See issue #515 for details.
// ---------------------------------------------------------------------------

export type WorkLocationRecord = {
  /** Composite key: "<YYYY-MM-DD>" */
  date: string;
  countryCode: string;
  location: "home" | "office" | "other";
  label?: string;
};

export const workLocationsCollection = createCollection(
  localOnlyCollectionOptions<WorkLocationRecord>({
    id: "worktime/work-locations",
    getKey: (record) => record.date,
  }),
);
