import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { normalizeEventFlags } from "@/lib/hday/flags";
import { parseHday } from "@/lib/hday/parser";
import { toLine } from "@/lib/hday/serializer";
import type { EventFlag, HdayEvent } from "@/lib/hday/types";
import type {
  TimeOffDateEntry,
  TimeOffEntry,
  TimeOffEntryFlag,
  TimeOffEntryType,
  TimeOffImportResult,
  TimeOffRangeEntry,
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

function isValidRange(start: string, end: string): boolean {
  const startDay = dayjs(start);
  const endDay = dayjs(end);
  return startDay.isValid() && endDay.isValid() && !endDay.isBefore(startDay, "day");
}

type TimeOffEntryInput =
  | (Omit<TimeOffDateEntry, "id"> & { id?: string })
  | (Omit<TimeOffRangeEntry, "id"> & { id?: string })
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

  if (data.kind === "range") {
    return {
      id: data.id ?? uuidv4(),
      kind: "range",
      start: data.start,
      end: data.end,
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
  const skippedLines: string[] = [];

  for (const event of parsed) {
    if (event.type === "unknown") {
      skippedLines.push(event.raw ?? "");
      continue;
    }

    const metadata = getEntryMetadataFromFlags(event.flags);

    if (event.type === "weekly") {
      if (!event.weekday || event.weekday < 1 || event.weekday > 7) {
        skippedLines.push(event.raw ?? "");
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
      skippedLines.push(event.raw ?? "");
      continue;
    }

    const start = toIsoDate(event.start);
    const end = toIsoDate(event.end ?? event.start);
    if (!isValidRange(start, end)) {
      skippedLines.push(event.raw ?? "");
      continue;
    }

    entries.push(
      start === end
        ? createTimeOffEntry({
            kind: "date",
            date: start,
            entryType: metadata.entryType,
            flags: metadata.flags,
            note: event.title?.trim() || null,
          })
        : createTimeOffEntry({
            kind: "range",
            start,
            end,
            entryType: metadata.entryType,
            flags: metadata.flags,
            note: event.title?.trim() || null,
          }),
    );
  }

  return { entries, skippedLines };
}

export function timeOffEntriesToHday(entries: TimeOffEntry[]): string {
  const sortedEntries = [...entries].sort((a, b) => {
    if (isTimeOffWeeklyEntry(a) && isTimeOffWeeklyEntry(b)) {
      return a.weekday - b.weekday || a.id.localeCompare(b.id);
    }

    if (isTimeOffWeeklyEntry(a)) return 1;
    if (isTimeOffWeeklyEntry(b)) return -1;

    const leftStart = isTimeOffDateEntry(a) ? a.date : a.start;
    const rightStart = isTimeOffDateEntry(b) ? b.date : b.start;
    return leftStart.localeCompare(rightStart) || a.id.localeCompare(b.id);
  });

  return sortedEntries
    .map((entry) => {
      if (isTimeOffWeeklyEntry(entry)) {
        return toLine({
          type: "weekly",
          weekday: entry.weekday,
          title: entry.note ?? "",
          flags: getEntryFlags(entry.entryType, entry.flags),
        });
      }

      const isDateEntry = isTimeOffDateEntry(entry);
      const start = isDateEntry ? entry.date : entry.start;
      const end = isDateEntry ? undefined : entry.end;
      return toLine({
        type: "range",
        start: toHdayDate(start),
        end: end ? toHdayDate(end) : undefined,
        title: entry.note ?? "",
        flags: getEntryFlags(entry.entryType, entry.flags),
      });
    })
    .join("\n");
}

export function entriesToHdayEvents(entries: TimeOffEntry[]): HdayEvent[] {
  return entries.map((entry) => {
    if (isTimeOffWeeklyEntry(entry)) {
      return {
        type: "weekly",
        weekday: entry.weekday,
        title: entry.note ?? "",
        flags: getEntryFlags(entry.entryType, entry.flags),
      };
    }

    const isDateEntry = isTimeOffDateEntry(entry);
    const start = isDateEntry ? entry.date : entry.start;
    const end = isDateEntry ? undefined : entry.end;
    return {
      type: "range",
      start: toHdayDate(start),
      end: end ? toHdayDate(end) : undefined,
      title: entry.note ?? "",
      flags: getEntryFlags(entry.entryType, entry.flags),
    };
  });
}

export function buildTimeOffEntryForDate(input: {
  date: string;
  note?: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
}): TimeOffEntry {
  return createTimeOffEntry({
    kind: "date",
    date: input.date,
    entryType: input.entryType,
    flags: input.flags,
    note: input.note?.trim() || null,
  });
}

export function buildTimeOffEntryForRange(input: {
  start: string;
  end?: string;
  note?: string;
  entryType: TimeOffEntryType;
  flags: TimeOffEntryFlag[];
}): TimeOffEntry {
  const start = input.start.replace(/-/g, "/");
  const end = (input.end ?? input.start).replace(/-/g, "/");
  const startIso = toIsoDate(start);
  const endIso = toIsoDate(end);

  if (startIso === endIso) {
    return buildTimeOffEntryForDate({
      date: startIso,
      note: input.note,
      entryType: input.entryType,
      flags: input.flags,
    });
  }

  return createTimeOffEntry({
    kind: "range",
    start: startIso,
    end: endIso,
    entryType: input.entryType,
    flags: input.flags,
    note: input.note?.trim() || null,
  });
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
