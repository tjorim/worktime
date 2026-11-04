import type { TimeOffEntry } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";

/** Inclusive date overlap; opposite half-days occupy separate parts of the day. */
export function entriesOverlap(a: TimeOffEntry, b: TimeOffEntry): boolean {
  if (
    (a.entryFlag === "half_am" && b.entryFlag === "half_pm") ||
    (a.entryFlag === "half_pm" && b.entryFlag === "half_am")
  )
    return false;
  if (a.entryKind === "weekly" && b.entryKind === "weekly") return a.weekday === b.weekday;
  if (a.entryKind === "weekly" || b.entryKind === "weekly") {
    const weekly = a.entryKind === "weekly" ? a : b;
    const dated = a.entryKind === "weekly" ? b : a;
    if (weekly.entryKind !== "weekly" || dated.entryKind === "weekly") return false;
    const start = dayjs(dated.entryKind === "date" ? dated.date : dated.start);
    const end = dayjs(dated.entryKind === "date" ? dated.date : dated.end);
    const offset = (weekly.weekday - start.isoWeekday() + 7) % 7;
    return start.add(offset, "day").isSameOrBefore(end, "day");
  }
  const startA = a.entryKind === "date" ? a.date : a.start;
  const endA = a.entryKind === "date" ? a.date : a.end;
  const startB = b.entryKind === "date" ? b.date : b.start;
  const endB = b.entryKind === "date" ? b.date : b.end;
  return startA <= endB && startB <= endA;
}

export function getOverlappingEntries(entry: TimeOffEntry, entries: readonly TimeOffEntry[]) {
  return entries.filter((other) => other.id !== entry.id && entriesOverlap(entry, other));
}
