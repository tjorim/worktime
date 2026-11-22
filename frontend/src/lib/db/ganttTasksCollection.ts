import type { GanttTaskSyncRead, SyncPushPayload } from "@/api-types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { pushAndCommit, syncQueryFn } from "@/lib/db/collectionTransport";
import { queryClient } from "@/lib/query/queryClient";
import type { GanttTask } from "@/types/gantt";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

export function syncGanttTaskToGanttTask(g: GanttTaskSyncRead): GanttTask {
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

export const ganttTasksCollection = createCollection(
  queryCollectionOptions<GanttTask>({
    id: "worktime/gantt-tasks",
    queryKey: ["sync", "gantt-tasks"],
    queryClient,
    getKey: (task) => task.id,
    staleTime: Infinity,
    queryFn: (): Promise<GanttTask[]> =>
      syncQueryFn<GanttTask>("gantt-tasks", ganttTasksCollection, (data) =>
        (data.gantt_tasks ?? []).filter((g) => g.deleted_at === null).map(syncGanttTaskToGanttTask),
      ),
    onInsert: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onUpdate: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onDelete: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
  }),
);
