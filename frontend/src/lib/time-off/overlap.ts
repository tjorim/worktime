import { dayjs } from "@/lib/dates/dateTimeUtils";
import type { TimeOffEntry } from "@/lib/time-off/types";

function getPrecedence(entry: TimeOffEntry): number {
  if (entry.entryKind === "weekly") return 1;
  if (entry.entryKind === "range" && entry.start !== entry.end) return 2;
  return 3;
}

function occursOn(entry: TimeOffEntry, day: string): boolean {
  switch (entry.entryKind) {
    case "date":
      return entry.date === day;
    case "range":
      return entry.start <= day && day <= entry.end;
    case "weekly":
      return entry.weekday === dayjs(day).isoWeekday();
  }
}

/** Return all entries tied for the highest precedence on this date. */
export function getEffectiveEntriesForDay(entries: readonly TimeOffEntry[], day: string) {
  const occurrences = entries.filter((entry) => occursOn(entry, day));
  const highest = occurrences.reduce((max, entry) => Math.max(max, getPrecedence(entry)), 0);
  return occurrences.filter((entry) => getPrecedence(entry) === highest);
}

export type OverlapPeriod = { weekday: number } | { start: string; end: string };

function getOverlapPeriod(a: TimeOffEntry, b: TimeOffEntry): OverlapPeriod | null {
  // Opposite half-days occupy separate parts of the day.
  if (
    (a.entryFlag === "half_am" && b.entryFlag === "half_pm") ||
    (a.entryFlag === "half_pm" && b.entryFlag === "half_am")
  ) {
    return null;
  }
  if (getPrecedence(a) !== getPrecedence(b)) return null;
  if (a.entryKind === "weekly" || b.entryKind === "weekly") {
    return a.entryKind === "weekly" && b.entryKind === "weekly" && a.weekday === b.weekday
      ? { weekday: a.weekday }
      : null;
  }
  const startA = a.entryKind === "date" ? a.date : a.start;
  const startB = b.entryKind === "date" ? b.date : b.start;
  const endA = a.entryKind === "date" ? a.date : a.end;
  const endB = b.entryKind === "date" ? b.date : b.end;
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return start <= end ? { start, end } : null;
}

export function entriesOverlap(a: TimeOffEntry, b: TimeOffEntry, day: string): boolean {
  const period = getOverlapPeriod(a, b);
  if (!period) return false;
  return "weekday" in period
    ? period.weekday === dayjs(day).isoWeekday()
    : period.start <= day && day <= period.end;
}

export function getOverlappingEntries(entry: TimeOffEntry, entries: readonly TimeOffEntry[]) {
  return entries.flatMap((other) => {
    if (other.id === entry.id) return [];
    const period = getOverlapPeriod(entry, other);
    return period ? [{ entry: other, period }] : [];
  });
}
