export const TIME_OFF_ENTRY_TYPES = [
  "vacation",
  "business",
  "course",
  "in",
  "weekend",
  "birthday",
  "ill",
  "other",
] as const;

export type TimeOffEntryType = (typeof TIME_OFF_ENTRY_TYPES)[number];

export type TimeOffEntryKind = "date" | "range" | "weekly";

/** Storage-level flag on a time-off entry. "full_day" is the explicit default (no hday letter). */
export type TimeOffEntryFlag = "full_day" | "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly";

interface TimeOffEntryBase {
  id: string;
  entryType: TimeOffEntryType;
  entryFlag: TimeOffEntryFlag;
  note: string | null;
}

export interface TimeOffDateEntry extends TimeOffEntryBase {
  entryKind: "date";
  date: string;
}

export interface TimeOffRangeEntry extends TimeOffEntryBase {
  entryKind: "range";
  start: string;
  end: string;
}

export interface TimeOffWeeklyEntry extends TimeOffEntryBase {
  entryKind: "weekly";
  weekday: number;
}

export type TimeOffEntry = TimeOffDateEntry | TimeOffRangeEntry | TimeOffWeeklyEntry;

export interface TimeOffImportResult {
  entries: TimeOffEntry[];
  skippedLines: string[];
}

export function isValidEntryType(value: unknown): value is TimeOffEntryType {
  return typeof value === "string" && TIME_OFF_ENTRY_TYPES.includes(value as TimeOffEntryType);
}

export function isValidFlag(value: unknown): value is TimeOffEntryFlag {
  return (
    value === "full_day" ||
    value === "half_am" ||
    value === "half_pm" ||
    value === "onsite" ||
    value === "no_fly" ||
    value === "can_fly"
  );
}

export function isTimeOffDateEntry(entry: TimeOffEntry): entry is TimeOffDateEntry {
  return entry.entryKind === "date";
}

export function isTimeOffRangeEntry(entry: TimeOffEntry): entry is TimeOffRangeEntry {
  return entry.entryKind === "range";
}

export function isTimeOffWeeklyEntry(entry: TimeOffEntry): entry is TimeOffWeeklyEntry {
  return entry.entryKind === "weekly";
}

export function getTimeOffEntrySortKey(entry: TimeOffEntry): string {
  switch (entry.entryKind) {
    case "date":
      return `0:${entry.date}`;
    case "range":
      return `1:${entry.start}:${entry.end}`;
    case "weekly":
      return `2:${entry.weekday}`;
  }
}

export function getTimeOffEntryIdentityKey(entry: TimeOffEntry): string {
  switch (entry.entryKind) {
    case "date":
      return `date:${entry.date}`;
    case "range":
      return `range:${entry.start}:${entry.end}`;
    case "weekly":
      return `weekly:${entry.weekday}`;
  }
}
