import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { normalizeEventFlags } from "../hday/flags";
import { parseHday } from "../hday/parser";
import { toLine } from "../hday/serializer";
import type { EventFlag, HdayEvent } from "../hday/types";
import type {
  TimeOffDateEntry,
  TimeOffEntry,
  TimeOffEntryFlag,
  TimeOffEntryType,
  TimeOffImportResult,
  TimeOffWeeklyEntry,
} from "./types";
import { isTimeOffDateEntry, isTimeOffWeeklyEntry } from "./types";

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

function getEntryMetadataFromFlags(flags: EventFlag[] | undefined): {
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
} {
  const normalizedFlags = normalizeEventFlags(flags ?? ["holiday"]);
  const typeFlag = normalizedFlags.find((flag) => flag in TYPE_FLAG_TO_ENTRY_TYPE) ?? "holiday";
  const entryType = TYPE_FLAG_TO_ENTRY_TYPE[typeFlag] ?? "vacation";
  const timeFlags = normalizedFlags.filter(
    (flag): flag is TimeOffEntryFlag =>
      flag === "half_am" ||
      flag === "half_pm" ||
      flag === "onsite" ||
      flag === "no_fly" ||
      flag === "can_fly",
  );
  return { entryType, flags: timeFlags };
}

type TimeOffEntryInput =
  | (Omit<TimeOffDateEntry, "id"> & { id?: string })
  | (Omit<TimeOffWeeklyEntry, "id"> & { id?: string });

export function createTimeOffEntry(data: TimeOffEntryInput): TimeOffEntry {
  if (data.kind === "weekly") {
    return {
      id: data.id ?? uuidv4(),
      kind: "weekly",
      weekday: data.weekday,
      entryType: data.entryType,
      flags: [...data.flags],
      note: data.note?.trim() || null,
    };
  }

  return {
    id: data.id ?? uuidv4(),
    kind: "date",
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
    if (event.type === "unknown") {
      skippedUnknownCount += 1;
      continue;
    }

    const metadata = getEntryMetadataFromFlags(event.flags);

    if (event.type === "weekly") {
      if (!event.weekday || event.weekday < 1 || event.weekday > 7) {
        skippedWeeklyCount += 1;
        continue;
      }

      entries.push(
        createTimeOffEntry({
          kind: "weekly",
          weekday: event.weekday,
          entryType: metadata.entryType,
          flags: metadata.flags,
          note: event.title?.trim() || null,
        }),
      );
      continue;
    }

    if (!event.start) {
      skippedUnknownCount += 1;
      continue;
    }

    const dates = expandRange(event.start, event.end ?? event.start);
    if (dates.length === 0) {
      skippedUnknownCount += 1;
      continue;
    }

    for (const date of dates) {
      entries.push(
        createTimeOffEntry({
          kind: "date",
          date,
          entryType: metadata.entryType,
          flags: metadata.flags,
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

function sameMetadata(
  left: Pick<TimeOffDateEntry | TimeOffWeeklyEntry, "entryType" | "flags" | "note">,
  right: Pick<TimeOffDateEntry | TimeOffWeeklyEntry, "entryType" | "flags" | "note">,
): boolean {
  return (
    left.entryType === right.entryType &&
    left.note === right.note &&
    left.flags.join("|") === right.flags.join("|")
  );
}

export function timeOffEntriesToHday(entries: TimeOffEntry[]): string {
  const datedEntries = entries
    .filter(isTimeOffDateEntry)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const weeklyEntries = entries
    .filter(isTimeOffWeeklyEntry)
    .sort((a, b) => a.weekday - b.weekday || a.id.localeCompare(b.id));

  const groups: EntryRangeGroup[] = [];
  for (const entry of datedEntries) {
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

    const previousEntry: TimeOffDateEntry = {
      id: "group",
      kind: "date",
      date: previous.end,
      entryType: previous.entryType,
      flags: previous.flags,
      note: previous.note,
    };
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

  const rangeLines = groups.map((group) =>
    toLine({
      type: "range",
      start: toHdayDate(group.start),
      end: toHdayDate(group.end),
      title: group.note ?? "",
      flags: getEntryFlags(group.entryType, group.flags),
    }),
  );

  const weeklyLines = weeklyEntries.map((entry) =>
    toLine({
      type: "weekly",
      weekday: entry.weekday,
      title: entry.note ?? "",
      flags: getEntryFlags(entry.entryType, entry.flags),
    }),
  );

  return [...rangeLines, ...weeklyLines].join("\n");
}

export function entriesToHdayEvents(entries: TimeOffEntry[]): HdayEvent[] {
  return entries.map((entry) =>
    isTimeOffDateEntry(entry)
      ? {
          type: "range",
          start: toHdayDate(entry.date),
          end: toHdayDate(entry.date),
          title: entry.note ?? "",
          flags: getEntryFlags(entry.entryType, entry.flags),
        }
      : {
          type: "weekly",
          weekday: entry.weekday,
          title: entry.note ?? "",
          flags: getEntryFlags(entry.entryType, entry.flags),
        },
  );
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
      kind: "date",
      date,
      entryType: input.entryType,
      flags: input.flags,
      note: input.note?.trim() || null,
    }),
  );
}

export function createWeeklyTimeOffEntry(input: {
  weekday: number;
  note?: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
}): TimeOffEntry {
  return createTimeOffEntry({
    kind: "weekly",
    weekday: input.weekday,
    entryType: input.entryType,
    flags: input.flags,
    note: input.note?.trim() || null,
  });
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
