import { v4 as uuidv4 } from "uuid";
import { dayjs } from "@/utils/dateTimeUtils";
import { normalizeEventFlags } from "@/lib/hday/flags";
import { parseHday } from "@/lib/hday/parser";
import { toLine } from "@/lib/hday/serializer";
import type { EventFlag } from "@/lib/hday/types";
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

function getEntryFlags(entryType: TimeOffEntryType, entryFlag: TimeOffEntryFlag): EventFlag[] {
  const typeFlag = ENTRY_TYPE_TO_EVENT_FLAG[entryType];
  return normalizeEventFlags(entryFlag !== "full_day" ? [typeFlag, entryFlag] : [typeFlag]);
}

function getEntryMetadataFromFlags(flags: EventFlag[] | undefined): {
  entryType: TimeOffEntryType;
  entryFlag: TimeOffEntryFlag;
} {
  const normalizedFlags = normalizeEventFlags(flags ?? ["holiday"]);
  const typeFlag = normalizedFlags.find((f) => f in TYPE_FLAG_TO_ENTRY_TYPE) ?? "holiday";
  const entryType = TYPE_FLAG_TO_ENTRY_TYPE[typeFlag] ?? "vacation";
  const matchedTimeFlag = normalizedFlags.find(
    (f) =>
      f === "half_am" || f === "half_pm" || f === "onsite" || f === "no_fly" || f === "can_fly",
  );
  const timeFlag: TimeOffEntryFlag =
    matchedTimeFlag != null ? (matchedTimeFlag as TimeOffEntryFlag) : "full_day";
  return { entryType, entryFlag: timeFlag };
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
  if (data.entryKind === "weekly") {
    return {
      id: data.id ?? uuidv4(),
      entryKind: "weekly",
      weekday: data.weekday,
      entryType: data.entryType,
      entryFlag: data.entryFlag,
      note: data.note?.trim() || null,
    };
  }

  if (data.entryKind === "range") {
    return {
      id: data.id ?? uuidv4(),
      entryKind: "range",
      start: data.start,
      end: data.end,
      entryType: data.entryType,
      entryFlag: data.entryFlag,
      note: data.note?.trim() || null,
    };
  }

  return {
    id: data.id ?? uuidv4(),
    entryKind: "date",
    date: data.date,
    entryType: data.entryType,
    entryFlag: data.entryFlag,
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
          entryKind: "weekly",
          weekday: event.weekday,
          entryType: metadata.entryType,
          entryFlag: metadata.entryFlag,
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
            entryKind: "date",
            date: start,
            entryType: metadata.entryType,
            entryFlag: metadata.entryFlag,
            note: event.title?.trim() || null,
          })
        : createTimeOffEntry({
            entryKind: "range",
            start,
            end,
            entryType: metadata.entryType,
            entryFlag: metadata.entryFlag,
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
          flags: getEntryFlags(entry.entryType, entry.entryFlag),
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
        flags: getEntryFlags(entry.entryType, entry.entryFlag),
      });
    })
    .join("\n");
}

export function buildTimeOffEntryForDate(input: {
  date: string;
  note?: string;
  entryType: TimeOffEntryType;
  entryFlag: TimeOffEntryFlag;
}): TimeOffEntry {
  return createTimeOffEntry({
    entryKind: "date",
    date: input.date,
    entryType: input.entryType,
    entryFlag: input.entryFlag,
    note: input.note?.trim() || null,
  });
}

export function buildTimeOffEntryForRange(input: {
  start: string;
  end?: string;
  note?: string;
  entryType: TimeOffEntryType;
  entryFlag: TimeOffEntryFlag;
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
      entryFlag: input.entryFlag,
    });
  }

  return createTimeOffEntry({
    entryKind: "range",
    start: startIso,
    end: endIso,
    entryType: input.entryType,
    entryFlag: input.entryFlag,
    note: input.note?.trim() || null,
  });
}

export function createWeeklyTimeOffEntry(input: {
  weekday: number;
  note?: string;
  entryType: TimeOffEntryType;
  entryFlag: TimeOffEntryFlag;
}): TimeOffEntry {
  return createTimeOffEntry({
    entryKind: "weekly",
    weekday: input.weekday,
    entryType: input.entryType,
    entryFlag: input.entryFlag,
    note: input.note?.trim() || null,
  });
}

export function getEntryFlagsForDisplay(entry: TimeOffEntry): EventFlag[] {
  return getEntryFlags(entry.entryType, entry.entryFlag);
}

export function getEntryTypeFromDisplayFlags(flags: EventFlag[]): TimeOffEntryType {
  const normalizedFlags = normalizeEventFlags(flags);
  const typeFlag = normalizedFlags.find((f) => f in TYPE_FLAG_TO_ENTRY_TYPE) ?? "holiday";
  return TYPE_FLAG_TO_ENTRY_TYPE[typeFlag] ?? "vacation";
}

export function getEntryTimeFlagFromDisplayFlags(flags: EventFlag[]): TimeOffEntryFlag {
  const match = normalizeEventFlags(flags).find(
    (f) =>
      f === "half_am" || f === "half_pm" || f === "onsite" || f === "no_fly" || f === "can_fly",
  );
  return match != null ? (match as TimeOffEntryFlag) : "full_day";
}
