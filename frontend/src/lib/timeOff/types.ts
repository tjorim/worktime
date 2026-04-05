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

export interface TimeOffEntry {
  id: string;
  date: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
  note: string | null;
}

export interface TimeOffImportResult {
  entries: TimeOffEntry[];
  skippedWeeklyCount: number;
  skippedUnknownCount: number;
}
