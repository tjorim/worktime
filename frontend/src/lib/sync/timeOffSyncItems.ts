import type { TimeOffEntry } from "@/lib/time-off/types";

import type { TimeOffEntrySyncCreateItem } from "@/api-types";

/**
 * Convert canonical time-off entries into the backend's structured sync payload.
 */
export function timeOffEntriesToSyncItems(
  entries: TimeOffEntry[],
  clientUpdatedAt: string,
): TimeOffEntrySyncCreateItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    action: "create",
    client_updated_at: clientUpdatedAt,
    entry_kind: entry.entryKind,
    date: entry.entryKind === "date" ? entry.date : null,
    start_date: entry.entryKind === "range" ? entry.start : null,
    end_date: entry.entryKind === "range" ? entry.end : null,
    weekday: entry.entryKind === "weekly" ? entry.weekday : null,
    entry_type: entry.entryType,
    entry_flag: entry.entryFlag,
    note: entry.note,
  }));
}
