import type { SyncPushPayload, TimeOffEntrySyncRead } from "@/api-types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { pushAndCommit, pushAndQueue, syncQueryFn } from "@/lib/db/collectionTransport";
import { queryClient } from "@/lib/query/queryClient";
import { MAX_SYNC_PUSH_ITEMS } from "@/lib/sync/syncRequests";
import { createTimeOffEntry } from "@/lib/time-off/codecs";
import type { TimeOffEntry } from "@/lib/time-off/types";
import { isValidEntryType, isValidFlag } from "@/lib/time-off/types";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

export function syncItemsToTimeOffEntries(items: TimeOffEntrySyncRead[]): TimeOffEntry[] {
  const results: TimeOffEntry[] = [];
  for (const item of items) {
    if (item.deleted_at !== null) continue;
    const entryType = isValidEntryType(item.entry_type) ? item.entry_type : "other";
    const entryFlag = isValidFlag(item.entry_flag) ? item.entry_flag : "full_day";
    if (item.entry_kind === "date" && item.date != null) {
      results.push(
        createTimeOffEntry({
          id: item.entry_id,
          entryKind: "date",
          date: item.date,
          entryType,
          entryFlag,
          note: item.note,
        }),
      );
    } else if (item.entry_kind === "range" && item.start_date != null && item.end_date != null) {
      results.push(
        createTimeOffEntry({
          id: item.entry_id,
          entryKind: "range",
          start: item.start_date,
          end: item.end_date,
          entryType,
          entryFlag,
          note: item.note,
        }),
      );
    } else if (item.entry_kind === "weekly" && item.weekday != null) {
      results.push(
        createTimeOffEntry({
          id: item.entry_id,
          entryKind: "weekly",
          weekday: item.weekday,
          entryType,
          entryFlag,
          note: item.note,
        }),
      );
    }
  }
  return results;
}

export const timeOffCollection = createCollection(
  queryCollectionOptions<TimeOffEntry>({
    id: "worktime/time-off-entries",
    queryKey: ["sync", "time-off-entries"],
    queryClient,
    getKey: (entry) => entry.id,
    staleTime: Infinity,
    queryFn: (): Promise<TimeOffEntry[]> =>
      syncQueryFn<TimeOffEntry>("time-off-entries", timeOffCollection, (data) =>
        syncItemsToTimeOffEntries(data.time_off_entries ?? []),
      ),
    onInsert: async ({ transaction, collection }) => {
      const now = dayjs().toISOString();
      const payload: SyncPushPayload = {
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        time_off_entries: transaction.mutations.map((m) => {
          const entry = m.modified;
          return {
            id: entry.id,
            action: "create",
            client_updated_at: now,
            entry_kind: entry.entryKind,
            date: entry.entryKind === "date" ? entry.date : null,
            start_date: entry.entryKind === "range" ? entry.start : null,
            end_date: entry.entryKind === "range" ? entry.end : null,
            weekday: entry.entryKind === "weekly" ? entry.weekday : null,
            entry_type: entry.entryType,
            entry_flag: entry.entryFlag,
            note: entry.note ?? null,
          };
        }),
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
        work_locations: [],
        time_off_entries: transaction.mutations.map((m) => {
          const entry = m.modified;
          return {
            id: entry.id,
            action: "update",
            client_updated_at: now,
            entry_kind: entry.entryKind,
            date: entry.entryKind === "date" ? entry.date : null,
            start_date: entry.entryKind === "range" ? entry.start : null,
            end_date: entry.entryKind === "range" ? entry.end : null,
            weekday: entry.entryKind === "weekly" ? entry.weekday : null,
            entry_type: entry.entryType,
            entry_flag: entry.entryFlag,
            note: entry.note ?? null,
          };
        }),
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
        work_locations: [],
        time_off_entries: transaction.mutations.map((m) => ({
          id: m.original.id,
          action: "delete",
          client_updated_at: now,
        })),
        gantt_tasks: [],
      };
      return pushAndCommit(payload, { collection, transaction });
    },
  }),
);

/** Push a file import as one request, preserving unchanged rows. */
export function pushTimeOffImport(
  current: TimeOffEntry[],
  target: TimeOffEntry[],
  allowBulkDelete = false,
): void {
  const now = dayjs().toISOString();
  const previous = new Map(current.map((entry) => [entry.id, entry]));
  const targetIds = new Set(target.map((entry) => entry.id));
  const changes: SyncPushPayload["time_off_entries"] = current
    .filter((entry) => !targetIds.has(entry.id))
    .map((entry) => ({ id: entry.id, action: "delete", client_updated_at: now }));
  for (const entry of target) {
    if (JSON.stringify(previous.get(entry.id)) === JSON.stringify(entry)) continue;
    const fields = {
      id: entry.id,
      client_updated_at: now,
      entry_kind: entry.entryKind,
      date: entry.entryKind === "date" ? entry.date : null,
      start_date: entry.entryKind === "range" ? entry.start : null,
      end_date: entry.entryKind === "range" ? entry.end : null,
      weekday: entry.entryKind === "weekly" ? entry.weekday : null,
      entry_type: entry.entryType,
      entry_flag: entry.entryFlag,
      note: entry.note,
    };
    // The API models a create and an update as separate request shapes, so the action picks one.
    changes.push(
      previous.has(entry.id) ? { ...fields, action: "update" } : { ...fields, action: "create" },
    );
  }
  const deleteTotal = changes.filter((change) => change.action === "delete").length;
  void (async () => {
    for (let offset = 0; offset < changes.length; offset += MAX_SYNC_PUSH_ITEMS) {
      await pushAndQueue({
        labels: [],
        tasks: [],
        templates: [],
        work_locations: [],
        gantt_tasks: [],
        time_off_entries: changes.slice(offset, offset + MAX_SYNC_PUSH_ITEMS),
        allow_bulk_delete: allowBulkDelete,
        declared_delete_total: deleteTotal,
      });
    }
  })();
}
