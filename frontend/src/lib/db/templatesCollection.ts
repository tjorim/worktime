import type { SyncPushPayload, TemplateSyncRead } from "@/api-types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { pushAndCommit, syncQueryFn } from "@/lib/db/collectionTransport";
import { queryClient } from "@/lib/query/queryClient";
import type { TimeTrackingTemplate } from "@/lib/time-tracking/types";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

export function syncTemplateToTemplate(t: TemplateSyncRead): TimeTrackingTemplate {
  return {
    id: t.id,
    text: t.text,
    label: t.label_id ?? "",
    start: t.start_time.slice(0, 5),
    stop: t.stop_time.slice(0, 5),
  };
}

export const templatesCollection = createCollection(
  queryCollectionOptions<TimeTrackingTemplate>({
    id: "worktime/templates",
    queryKey: ["sync", "templates"],
    queryClient,
    getKey: (template) => template.id,
    staleTime: Infinity,
    queryFn: (): Promise<TimeTrackingTemplate[]> =>
      syncQueryFn<TimeTrackingTemplate>("templates", templatesCollection, (data) =>
        data.templates.filter((t) => t.deleted_at === null).map(syncTemplateToTemplate),
      ),
    onInsert: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onUpdate: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onDelete: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
  }),
);
