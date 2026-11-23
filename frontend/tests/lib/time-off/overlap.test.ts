import { describe, expect, it } from "vitest";
import {
  entriesOverlap,
  getEffectiveEntriesForDay,
  getOverlappingEntries,
} from "@/lib/time-off/overlap";
import type { TimeOffEntry } from "@/lib/time-off/types";

const base = { entryType: "vacation", entryFlag: "full_day", note: null } as const;
const range = {
  ...base,
  id: "range",
  entryKind: "range",
  start: "2026-11-09",
  end: "2026-11-13",
} satisfies TimeOffEntry;
const date = { ...base, id: "date", entryKind: "date", date: "2026-11-11" } satisfies TimeOffEntry;
const weekly = { ...base, id: "weekly", entryKind: "weekly", weekday: 3 } satisfies TimeOffEntry;

describe("time-off overlaps", () => {
  it.each([
    [weekly, date],
    [weekly, range],
    [range, date],
  ])("allows %s and %s to coexist on the same day", (lower, higher) => {
    expect(entriesOverlap(lower, higher, date.date)).toBe(false);
    expect(entriesOverlap(higher, lower, date.date)).toBe(false);
    expect(getOverlappingEntries(lower, [higher])).toEqual([]);
    expect(getEffectiveEntriesForDay([lower, higher], date.date)).toEqual([higher]);
    expect(getEffectiveEntriesForDay([higher, lower], date.date)).toEqual([higher]);
  });

  it("returns all highest-precedence entries occurring on the requested date", () => {
    const otherDate = { ...date, id: "other" };
    const entries = [range, date, weekly, otherDate];
    expect(getEffectiveEntriesForDay(entries, date.date)).toEqual([date, otherDate]);
    expect(getEffectiveEntriesForDay(entries, range.end)).toEqual([range]);
    expect(getEffectiveEntriesForDay(entries, "2026-11-18")).toEqual([weekly]);
    expect(getEffectiveEntriesForDay(entries, "2026-11-19")).toEqual([]);
  });

  it("flags singles only on their shared date", () => {
    expect(entriesOverlap(date, { ...date, id: "other" }, date.date)).toBe(true);
    expect(entriesOverlap(date, date, "2026-11-12")).toBe(false);
    expect(entriesOverlap(date, { ...date, date: "2026-11-18" }, date.date)).toBe(false);
  });

  it("treats a stored one-day range as a single-day entry", () => {
    const oneDayRange = { ...range, start: date.date, end: date.date };
    expect(entriesOverlap(date, oneDayRange, date.date)).toBe(true);
    expect(entriesOverlap(range, oneDayRange, date.date)).toBe(false);
    expect(getEffectiveEntriesForDay([range, oneDayRange], date.date)).toEqual([oneDayRange]);
  });

  it("flags only the inclusive intersection of two ranges", () => {
    const otherRange = { ...range, id: "other", start: "2026-11-13", end: "2026-11-20" };
    expect(entriesOverlap(range, otherRange, "2026-11-12")).toBe(false);
    expect(entriesOverlap(range, otherRange, "2026-11-13")).toBe(true);
    expect(entriesOverlap(range, otherRange, "2026-11-14")).toBe(false);
    expect(getOverlappingEntries(range, [range, otherRange])).toEqual([
      { entry: otherRange, period: { start: "2026-11-13", end: "2026-11-13" } },
    ]);
    expect(getOverlappingEntries(range, [{ ...otherRange, start: "2026-11-14" }])).toEqual([]);
  });

  it("flags weekly entries only on their shared weekday", () => {
    const otherWeekly = { ...weekly, id: "other" };
    expect(entriesOverlap(weekly, otherWeekly, date.date)).toBe(true);
    expect(entriesOverlap(weekly, otherWeekly, "2026-11-12")).toBe(false);
    expect(entriesOverlap(weekly, { ...otherWeekly, weekday: 4 }, date.date)).toBe(false);
    expect(getOverlappingEntries(weekly, [otherWeekly])).toEqual([
      { entry: otherWeekly, period: { weekday: 3 } },
    ]);
  });

  it("separates opposite half-days but treats location flags as full-day occupancy", () => {
    const morning = { ...date, entryFlag: "half_am" } as const;
    const afternoon = { ...date, entryFlag: "half_pm" } as const;
    expect(entriesOverlap(morning, afternoon, date.date)).toBe(false);
    expect(entriesOverlap(afternoon, morning, date.date)).toBe(false);
    for (const entryFlag of ["full_day", "half_am", "onsite", "no_fly", "can_fly"] as const) {
      expect(entriesOverlap(morning, { ...date, entryFlag }, date.date)).toBe(true);
    }
  });
});
