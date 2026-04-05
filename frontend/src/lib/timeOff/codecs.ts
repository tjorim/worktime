import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { normalizeEventFlags } from "../hday/flags";
import { parseHday } from "../hday/parser";
import { toLine } from "../hday/serializer";
import type { EventFlag, HdayEvent } from "../hday/types";
import type {
  TimeOffEntry,
  TimeOffEntryFlag,
  TimeOffEntryType,
  TimeOffImportResult,
} from "./types";

const TYPE_FLAG_TO_ENTRY_TYPE: Record<string, TimeOffEntryType> = {
  holiday: "vacation",
  business: "business",
  course: "course",
  in: "in",
  weekend: "weekend",
  birthday: "birthday",
  ill: "ill",
  other: "other",
};

const ENTRY_TYPE_TO_EVENT_FLAG: Record<TimeOffEntryType, EventFlag> = {
  vacation: "holiday",
  business: "business",
  course: "course",
  in: "in",
  weekend: "weekend",
  birthday: "birthday",
  ill: "ill",
  other: "other",
};

function toIsoDate(value: string): string {
  return value.replace(/\//g, "-");
}

function toHdayDate(value: string): string {
  return value.replace(/-/g, "/");
}

function getEntryFlags(entryType: TimeOffEntryType, flags: TimeOffEntryFlag[]): EventFlag[] {
  return normalizeEventFlags([ENTRY_TYPE_TO_EVENT_FLAG[entryType], ...flags]);
}

function expandRange(start: string, end: string): string[] {
  const startDay = dayjs(toIsoDate(start));
  const endDay = dayjs(toIsoDate(end));
  if (!startDay.isValid() || !endDay.isValid() || endDay.isBefore(startDay, "day")) return [];

  const dates: string[] = [];
  let current = startDay.startOf("day");
  while (current.isSameOrBefore(endDay, "day")) {
    dates.push(current.format("YYYY-MM-DD"));
    current = current.add(1, "day");
  }

  return dates;
}

export function createTimeOffEntry(
  data: Omit<TimeOffEntry, "id"> & { id?: string },
): TimeOffEntry {
  return {
    id: data.id ?? uuidv4(),
    date: data.date,
    entryType: data.entryType,
    flags: [...data.flags],
    note: data.note?.trim() || null,
  };
}

export function hdayToTimeOffEntries(text: string): TimeOffImportResult {
  const parsed = text.trim() ? parseHday(text) : [];
  const entries: TimeOffEntry[] = [];
  let skippedWeeklyCount = 0;
  let skippedUnknownCount = 0;

  for (const event of parsed) {
    if (event.type === "weekly") {
      skippedWeeklyCount += 1;
      continue;
    }
    if (event.type === "unknown" || !event.start) {
      skippedUnknownCount += 1;
      continue;
    }

    const dates = expandRange(event.start, event.end ?? event.start);
    if (dates.length === 0) {
      skippedUnknownCount += 1;
      continue;
    }

    const normalizedFlags = normalizeEventFlags(event.flags ?? ["holiday"]);
    const typeFlag = normalizedFlags.find((flag) => flag in TYPE_FLAG_TO_ENTRY_TYPE) ?? "holiday";
    const entryType = TYPE_FLAG_TO_ENTRY_TYPE[typeFlag] ?? "vacation";
    const flags = normalizedFlags.filter(
      (flag): flag is TimeOffEntryFlag =>
        flag === "half_am" ||
        flag === "half_pm" ||
        flag === "onsite" ||
        flag === "no_fly" ||
        flag === "can_fly",
    );

    for (const date of dates) {
      entries.push(
        createTimeOffEntry({
          date,
          entryType,
          flags,
          note: event.title?.trim() || null,
        }),
      );
    }
  }

  return { entries, skippedWeeklyCount, skippedUnknownCount };
}

type EntryRangeGroup = {
  start: string;
  end: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
  note: string | null;
};

function sameMetadata(left: TimeOffEntry, right: TimeOffEntry): boolean {
  return (
    left.entryType === right.entryType &&
    left.note === right.note &&
    left.flags.join("|") === right.flags.join("|")
  );
}

export function timeOffEntriesToHday(entries: TimeOffEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const groups: EntryRangeGroup[] = [];

  for (const entry of sorted) {
    const previous = groups[groups.length - 1];
    if (!previous) {
      groups.push({
        start: entry.date,
        end: entry.date,
        entryType: entry.entryType,
        flags: [...entry.flags],
        note: entry.note,
      });
      continue;
    }

    const previousEntry = createTimeOffEntry({
      id: "group",
      date: previous.end,
      entryType: previous.entryType,
      flags: previous.flags,
      note: previous.note,
    });
    const nextExpectedDate = dayjs(previous.end).add(1, "day").format("YYYY-MM-DD");
    if (sameMetadata(previousEntry, entry) && entry.date === nextExpectedDate) {
      previous.end = entry.date;
      continue;
    }

    groups.push({
      start: entry.date,
      end: entry.date,
      entryType: entry.entryType,
      flags: [...entry.flags],
      note: entry.note,
    });
  }

  return groups
    .map((group) =>
      toLine({
        type: "range",
        start: toHdayDate(group.start),
        end: toHdayDate(group.end),
        title: group.note ?? "",
        flags: getEntryFlags(group.entryType, group.flags),
      }),
    )
    .join("\n");
}

export function entriesToHdayEvents(entries: TimeOffEntry[]): HdayEvent[] {
  return entries.map((entry) => ({
    type: "range",
    start: toHdayDate(entry.date),
    end: toHdayDate(entry.date),
    title: entry.note ?? "",
    flags: getEntryFlags(entry.entryType, entry.flags),
  }));
}

export function buildTimeOffEntriesForDateRange(input: {
  start: string;
  end?: string;
  note?: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
}): TimeOffEntry[] {
  const start = input.start.replace(/-/g, "/");
  const end = (input.end ?? input.start).replace(/-/g, "/");
  const dates = expandRange(start, end);
  return dates.map((date) =>
    createTimeOffEntry({
      date,
      entryType: input.entryType,
      flags: input.flags,
      note: input.note?.trim() || null,
    }),
  );
}

export function getEntryFlagsForDisplay(entry: TimeOffEntry): EventFlag[] {
  return getEntryFlags(entry.entryType, entry.flags);
}

export function getEntryTypeFromDisplayFlags(flags: EventFlag[]): TimeOffEntryType {
  const normalizedFlags = normalizeEventFlags(flags);
  const typeFlag = normalizedFlags.find((flag) => flag in TYPE_FLAG_TO_ENTRY_TYPE) ?? "holiday";
  return TYPE_FLAG_TO_ENTRY_TYPE[typeFlag] ?? "vacation";
}

export function getEntryTimeFlagsFromDisplayFlags(flags: EventFlag[]): TimeOffEntryFlag[] {
  return normalizeEventFlags(flags).filter(
    (flag): flag is TimeOffEntryFlag =>
      flag === "half_am" ||
      flag === "half_pm" ||
      flag === "onsite" ||
      flag === "no_fly" ||
      flag === "can_fly",
  );
}
