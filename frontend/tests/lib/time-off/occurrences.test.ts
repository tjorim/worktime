import { describe, expect, it } from "vitest";
import { getTimeOffOccurrences } from "@/lib/time-off/occurrences";
import type { TimeOffEntry } from "@/lib/time-off/types";

const metadata = { entryType: "vacation", entryFlag: "full_day", note: null } as const;
const first = new Date(2025, 0, 10);
const last = new Date(2025, 0, 31);

describe("getTimeOffOccurrences", () => {
  it("keeps overlapping ranges and dated entries on either edge in source order", () => {
    const entries: TimeOffEntry[] = [
      { ...metadata, id: "early", entryKind: "date", date: "2025-01-09" },
      { ...metadata, id: "first", entryKind: "date", date: "2025-01-10" },
      { ...metadata, id: "range", entryKind: "range", start: "2025-01-02", end: "2025-01-12" },
      { ...metadata, id: "last", entryKind: "date", date: "2025-01-31" },
      { ...metadata, id: "late", entryKind: "date", date: "2025-02-01" },
    ];
    expect(getTimeOffOccurrences(entries, first, last)).toEqual([
      { entry: entries[1], start: "2025-01-10", end: "2025-01-10" },
      { entry: entries[2], start: "2025-01-02", end: "2025-01-12" },
      { entry: entries[3], start: "2025-01-31", end: "2025-01-31" },
    ]);
  });

  it("expands weekly entries through the last day and retains the original entry", () => {
    const entry: TimeOffEntry = { ...metadata, id: "weekly", entryKind: "weekly", weekday: 5 };
    const dates = ["2025-01-10", "2025-01-17", "2025-01-24", "2025-01-31"];
    const occurrences = getTimeOffOccurrences([entry], first, last);
    expect(occurrences).toEqual(dates.map((date) => ({ entry, start: date, end: date })));
    expect(occurrences.every((occurrence) => occurrence.entry === entry)).toBe(true);
  });
});
