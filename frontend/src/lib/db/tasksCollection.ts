import type { SyncPushPayload, TaskSyncRead } from "@/api-types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { pushAndCommit, syncQueryFn } from "@/lib/db/collectionTransport";
import { queryClient } from "@/lib/query/queryClient";
import type { StoredTimeTrackingTask } from "@/lib/time-tracking/types";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

/** Convert UTC ISO-8601 datetime to local "YYYY-MM-DDTHH:mm" string. */
function utcIsoToLocalTime(utcIso: string): string {
  return dayjs(utcIso).format("YYYY-MM-DDTHH:mm");
}

export function syncTaskToStoredTask(t: TaskSyncRead): StoredTimeTrackingTask {
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

export const tasksCollection = createCollection(
  queryCollectionOptions<StoredTimeTrackingTask>({
    id: "worktime/tasks",
    queryKey: ["sync", "tasks"],
    queryClient,
    getKey: (task) => task.id,
    staleTime: Infinity,
    queryFn: (): Promise<StoredTimeTrackingTask[]> =>
      syncQueryFn<StoredTimeTrackingTask>("tasks", tasksCollection, (data) =>
        data.tasks.filter((t) => t.deleted_at === null).map(syncTaskToStoredTask),
      ),
    onInsert: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onUpdate: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onDelete: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
  }),
);
