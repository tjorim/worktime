import type { SyncPushPayload, WorkLocationSyncRead } from "@/api-types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { pushAndCommit, syncQueryFn } from "@/lib/db/collectionTransport";
import { queryClient } from "@/lib/query/queryClient";
import type { WorkLocationEntry } from "@/types/workLocation";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

export function syncWorkLocationToEntry(wl: WorkLocationSyncRead): WorkLocationEntry {
  return {
    date: wl.date,
    countryCode: wl.country_code as WorkLocationEntry["countryCode"],
    ...(wl.label ? { label: wl.label } : {}),
  };
}

export const workLocationsCollection = createCollection(
  queryCollectionOptions<WorkLocationEntry>({
    id: "worktime/work-locations",
    queryKey: ["sync", "work-locations"],
    queryClient,
    getKey: (entry) => entry.date,
    staleTime: Infinity,
    queryFn: (): Promise<WorkLocationEntry[]> =>
      syncQueryFn<WorkLocationEntry>("work-locations", workLocationsCollection, (data) =>
        data.work_locations.filter((wl) => wl.deleted_at === null).map(syncWorkLocationToEntry),
      ),
    onInsert: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onUpdate: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
    onDelete: async ({ transaction, collection }) => {
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
      return pushAndCommit(payload, { collection, transaction });
    },
  }),
);
