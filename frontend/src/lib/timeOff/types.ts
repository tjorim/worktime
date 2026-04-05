import type { TimeLocationFlag } from "../hday/types";

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

export type TimeOffEntryFlag = TimeLocationFlag;

export interface TimeOffDateEntry {
  id: string;
  kind: "date";
  date: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
  note: string | null;
}

export interface TimeOffWeeklyEntry {
  id: string;
  kind: "weekly";
  weekday: number;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
  note: string | null;
}

export type TimeOffEntry = TimeOffDateEntry | TimeOffWeeklyEntry;

export interface TimeOffImportResult {
  entries: TimeOffEntry[];
  skippedWeeklyCount: number;
  skippedUnknownCount: number;
}

export function isTimeOffDateEntry(entry: TimeOffEntry): entry is TimeOffDateEntry {
  return entry.kind === "date";
}

export function isTimeOffWeeklyEntry(entry: TimeOffEntry): entry is TimeOffWeeklyEntry {
  return entry.kind === "weekly";
}

export function getTimeOffEntrySortKey(entry: TimeOffEntry): string {
  return entry.kind === "date" ? `0:${entry.date}` : `1:${entry.weekday}`;
}

export function getTimeOffEntryIdentityKey(entry: TimeOffEntry): string {
  return entry.kind === "date" ? `date:${entry.date}` : `weekly:${entry.weekday}`;
}
