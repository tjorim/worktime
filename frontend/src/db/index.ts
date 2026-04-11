/**
 * TanStack DB — public surface for sync-managed domain collections.
 *
 * Import individual collections from here rather than directly from
 * `./collections` so that the `db/` folder has a stable public API.
 */

export {
  labelsCollection,
  tasksCollection,
  templatesCollection,
  timeOffCollection,
  ganttTasksCollection,
  workLocationsCollection,
  type WorkLocationRecord,
} from "./collections";
