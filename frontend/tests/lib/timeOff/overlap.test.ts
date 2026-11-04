import { describe, expect, it } from "vitest";
import { entriesOverlap, getOverlappingEntries } from "@/lib/timeOff/overlap";
import type { TimeOffEntry } from "@/lib/timeOff/types";
const base = { id: "a", entryType: "vacation", entryFlag: "full_day", note: null } as const;
const range: TimeOffEntry = { ...base, entryKind: "range", start: "2026-11-09", end: "2026-11-13" };
const date: TimeOffEntry = { ...base, id: "b", entryKind: "date", date: "2026-11-13" };
const weekly: TimeOffEntry = { ...base, id: "c", entryKind: "weekly", weekday: 3 };
describe("time-off overlaps", () => {
  it("includes range boundaries and single dates, symmetrically", () => {
    expect(entriesOverlap(range, date)).toBe(true);
    expect(entriesOverlap(date, range)).toBe(true);
    expect(entriesOverlap(date, date)).toBe(true);
    expect(entriesOverlap(range, { ...date, date: "2026-11-14" })).toBe(false);
    expect(entriesOverlap(range, { ...range, start: "2026-11-11", end: "2026-11-20" })).toBe(true);
  });
  it("checks weekly entries against dates, ranges and weekly patterns", () => {
    expect(entriesOverlap(range, weekly)).toBe(true);
    expect(entriesOverlap(weekly, range)).toBe(true);
    expect(entriesOverlap(weekly, date)).toBe(false);
    expect(entriesOverlap(weekly, { ...date, date: "2026-11-11" })).toBe(true);
    expect(entriesOverlap(weekly, weekly)).toBe(true);
    expect(entriesOverlap(weekly, { ...weekly, weekday: 4 })).toBe(false);
    expect(entriesOverlap({ ...weekly, weekday: 7 }, range)).toBe(false);
    expect(entriesOverlap({ ...weekly, weekday: 7 }, { ...range, end: "2027-11-13" })).toBe(true);
  });
  it("separates opposite half-days but treats location flags as full-day occupancy", () => {
    expect(
      entriesOverlap({ ...range, entryFlag: "half_am" }, { ...date, entryFlag: "half_pm" }),
    ).toBe(false);
    expect(
      entriesOverlap({ ...range, entryFlag: "half_pm" }, { ...date, entryFlag: "half_am" }),
    ).toBe(false);
    for (const entryFlag of ["full_day", "half_am", "onsite", "no_fly", "can_fly"] as const) {
      expect(entriesOverlap({ ...range, entryFlag: "half_am" }, { ...date, entryFlag })).toBe(true);
    }
    expect(
      entriesOverlap({ ...weekly, entryFlag: "half_am" }, { ...weekly, entryFlag: "half_pm" }),
    ).toBe(false);
  });
  it("excludes the entry being edited", () => {
    expect(getOverlappingEntries(range, [range, date, weekly])).toEqual([date, weekly]);
  });
});
