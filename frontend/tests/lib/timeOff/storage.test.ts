import { describe, expect, it } from "vitest";
import { normalizeTimeOffEntries } from "@/lib/timeOff/storage";

describe("normalizeTimeOffEntries", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeTimeOffEntries(null)).toEqual([]);
    expect(normalizeTimeOffEntries({})).toEqual([]);
    expect(normalizeTimeOffEntries("bad")).toEqual([]);
  });

  it("filters invalid shapes and empty ids", () => {
    expect(
      normalizeTimeOffEntries([
        null,
        "bad",
        {},
        { id: "", entryKind: "date", date: "2026-01-01", entryType: "vacation" },
        { id: "missing-type", entryKind: "date", date: "2026-01-01" },
        { id: "bad-type", entryKind: "date", date: "2026-01-01", entryType: "invalid" },
      ]),
    ).toEqual([]);
  });

  it("rejects invalid dates and inverted ranges", () => {
    expect(
      normalizeTimeOffEntries([
        { id: "bad-date", entryKind: "date", date: "2026-02-30", entryType: "vacation" },
        {
          id: "bad-range-date",
          entryKind: "range",
          start: "2026-04-31",
          end: "2026-05-01",
          entryType: "business",
        },
        {
          id: "inverted-range",
          entryKind: "range",
          start: "2026-05-02",
          end: "2026-05-01",
          entryType: "business",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects weekly entries with weekday outside 1 through 7", () => {
    expect(
      normalizeTimeOffEntries([
        { id: "weekday-zero", entryKind: "weekly", weekday: 0, entryType: "in" },
        { id: "weekday-eight", entryKind: "weekly", weekday: 8, entryType: "in" },
        { id: "weekday-string", entryKind: "weekly", weekday: "1", entryType: "in" },
      ]),
    ).toEqual([]);
  });

  it("falls back to full_day when entryFlag is invalid", () => {
    expect(
      normalizeTimeOffEntries([
        {
          id: "flag-fallback",
          entryKind: "date",
          date: "2026-01-15",
          entryType: "vacation",
          entryFlag: "bad-flag",
        },
      ]),
    ).toEqual([
      {
        id: "flag-fallback",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      },
    ]);
  });

  it("trims note text and drops blank notes", () => {
    expect(
      normalizeTimeOffEntries([
        {
          id: "trimmed-note",
          entryKind: "date",
          date: "2026-01-15",
          entryType: "vacation",
          note: "  Planned trip  ",
        },
        {
          id: "blank-note",
          entryKind: "date",
          date: "2026-01-16",
          entryType: "vacation",
          note: "   ",
        },
      ]),
    ).toEqual([
      {
        id: "trimmed-note",
        entryKind: "date",
        date: "2026-01-15",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Planned trip",
      },
      {
        id: "blank-note",
        entryKind: "date",
        date: "2026-01-16",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      },
    ]);
  });

  it("sorts by entry kind/date key, then identity, then id for stability", () => {
    expect(
      normalizeTimeOffEntries([
        {
          id: "weekly-b",
          entryKind: "weekly",
          weekday: 3,
          entryType: "in",
        },
        {
          id: "range-b",
          entryKind: "range",
          start: "2026-02-10",
          end: "2026-02-12",
          entryType: "business",
        },
        {
          id: "date-b",
          entryKind: "date",
          date: "2026-01-20",
          entryType: "vacation",
        },
        {
          id: "date-a",
          entryKind: "date",
          date: "2026-01-20",
          entryType: "vacation",
        },
        {
          id: "weekly-a",
          entryKind: "weekly",
          weekday: 1,
          entryType: "in",
        },
      ]),
    ).toEqual([
      {
        id: "date-a",
        entryKind: "date",
        date: "2026-01-20",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "date-b",
        entryKind: "date",
        date: "2026-01-20",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "range-b",
        entryKind: "range",
        start: "2026-02-10",
        end: "2026-02-12",
        entryType: "business",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "weekly-a",
        entryKind: "weekly",
        weekday: 1,
        entryType: "in",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "weekly-b",
        entryKind: "weekly",
        weekday: 3,
        entryType: "in",
        entryFlag: "full_day",
        note: null,
      },
    ]);
  });
});
