import type { LabelSyncRead, SyncPushPayload } from "@/api-types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { pushAndCommit, syncQueryFn } from "@/lib/db/collectionTransport";
import { queryClient } from "@/lib/query/queryClient";
import type { Label } from "@/lib/time-tracking/constants";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

export function syncLabelToLabel(l: LabelSyncRead): Label {
  return { id: l.id, name: l.name, color: l.color };
}

export const labelsCollection = createCollection(
  queryCollectionOptions<Label>({
    id: "worktime/labels",
    queryKey: ["sync", "labels"],
    queryClient,
    getKey: (label) => label.id,
    staleTime: Infinity,
    queryFn: (): Promise<Label[]> =>
      syncQueryFn<Label>("labels", labelsCollection, (data) =>
        data.labels.filter((l) => l.deleted_at === null).map(syncLabelToLabel),
      ),
    onInsert: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onUpdate: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onDelete: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
  }),
);
