import { describe, it, expect } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import {
  getLocationCountsInWeek,
  aggregateLocationCounts,
} from "../../src/utils/workLocationUtils";
import { toCountryCode } from "../../src/types/workLocation";
import type { WorkLocationInfo, WorkLocationMap } from "../../src/types/workLocation";

const cc = (value: string) => toCountryCode(value)!;
const HOME: WorkLocationInfo = { location: "home", countryCode: cc("NL") };
const OFFICE: WorkLocationInfo = { location: "office", countryCode: cc("BE") };
const OTHER_DE: WorkLocationInfo = { location: "other", countryCode: cc("DE") };

// ISO week 8 of 2026: Mon Feb 16 – Sun Feb 22
const MON = "2026-02-16";
const TUE = "2026-02-17";
const WED = "2026-02-18";
const THU = "2026-02-19";
const FRI = "2026-02-20";
const SAT = "2026-02-21";
const SUN = "2026-02-22";
// Day in the previous ISO week
const PREV_FRI = "2026-02-13";

describe("getLocationCountsInWeek", () => {
  it("returns all zeros for an empty map", () => {
    const map: WorkLocationMap = new Map();
    const counts = getLocationCountsInWeek(dayjs("2026-02-18"), map);
    expect(counts).toEqual({ home: 0, office: 0, other: 0 });
  });

  it("counts home, office, and other entries separately", () => {
    const map: WorkLocationMap = new Map([
      [MON, HOME],
      [TUE, OFFICE],
      [WED, OTHER_DE],
      [THU, HOME],
    ]);
    const counts = getLocationCountsInWeek(dayjs("2026-02-18"), map);
    expect(counts).toEqual({ home: 2, office: 1, other: 1 });
  });

  it("does not count entries from the previous week", () => {
    const map: WorkLocationMap = new Map([
      [PREV_FRI, HOME],
      [MON, OFFICE],
    ]);
    const counts = getLocationCountsInWeek(dayjs("2026-02-18"), map);
    expect(counts).toEqual({ home: 0, office: 1, other: 0 });
  });

  it("counts all seven days when the full week has entries", () => {
    const map: WorkLocationMap = new Map([
      [MON, HOME],
      [TUE, HOME],
      [WED, OFFICE],
      [THU, OFFICE],
      [FRI, OTHER_DE],
      [SAT, OTHER_DE],
      [SUN, HOME],
    ]);
    const counts = getLocationCountsInWeek(dayjs("2026-02-18"), map);
    expect(counts).toEqual({ home: 3, office: 2, other: 2 });
  });

  it("gives the same result regardless of which weekday is passed as input", () => {
    const map: WorkLocationMap = new Map([
      [MON, HOME],
      [FRI, OFFICE],
    ]);
    expect(getLocationCountsInWeek(dayjs("2026-02-16"), map)).toEqual({
      home: 1,
      office: 1,
      other: 0,
    });
    expect(getLocationCountsInWeek(dayjs("2026-02-18"), map)).toEqual({
      home: 1,
      office: 1,
      other: 0,
    });
    expect(getLocationCountsInWeek(dayjs("2026-02-22"), map)).toEqual({
      home: 1,
      office: 1,
      other: 0,
    });
  });
});

describe("aggregateLocationCounts", () => {
  it("returns an empty array for an empty map", () => {
    expect(aggregateLocationCounts(new Map())).toEqual([]);
  });

  it("groups entries by (location, countryCode) and sums day counts", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", HOME],
      ["2026-01-06", HOME],
      ["2026-01-07", OFFICE],
    ]);
    const result = aggregateLocationCounts(map);
    // Two distinct groups
    expect(result).toHaveLength(2);
    const homeRow = result.find((r) => r.location === "home");
    const officeRow = result.find((r) => r.location === "office");
    expect(homeRow).toEqual({ location: "home", countryCode: "NL", days: 2 });
    expect(officeRow).toEqual({ location: "office", countryCode: "BE", days: 1 });
  });

  it("sorts by days descending", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", OFFICE], // 1 day office
      ["2026-01-06", HOME], // 2 days home
      ["2026-01-07", HOME],
      ["2026-01-08", OTHER_DE], // 3 days other (DE)
      ["2026-01-09", OTHER_DE],
      ["2026-01-10", OTHER_DE],
    ]);
    const result = aggregateLocationCounts(map);
    // Assert full descending order
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].days).toBeGreaterThanOrEqual(result[i].days);
    }
    // Also compare to a sorted copy
    const sorted = [...result].sort((a, b) => b.days - a.days);
    expect(result).toEqual(sorted);
  });

  it("creates separate rows for other-location entries with different country codes", () => {
    const OTHER_US: WorkLocationInfo = { location: "other", countryCode: cc("US") };
    const map: WorkLocationMap = new Map([
      ["2026-01-05", OTHER_DE],
      ["2026-01-06", OTHER_US],
      ["2026-01-07", OTHER_DE],
    ]);
    const result = aggregateLocationCounts(map);
    expect(result).toHaveLength(2);
    const deRow = result.find((r) => r.countryCode === "DE");
    const usRow = result.find((r) => r.countryCode === "US");
    expect(deRow?.days).toBe(2);
    expect(usRow?.days).toBe(1);
  });

  it("creates separate rows for other-location entries with the same country but different labels", () => {
    const OTHER_DE_LABEL: WorkLocationInfo = {
      location: "other",
      countryCode: cc("DE"),
      label: "Berlin office",
    };
    const OTHER_DE_NOLABEL: WorkLocationInfo = { location: "other", countryCode: cc("DE") };
    const map: WorkLocationMap = new Map([
      ["2026-01-05", OTHER_DE_LABEL],
      ["2026-01-06", OTHER_DE_NOLABEL],
    ]);
    const result = aggregateLocationCounts(map);
    expect(result).toHaveLength(2);
  });

  it("preserves the label on other-location rows", () => {
    const OTHER_LABELED: WorkLocationInfo = {
      location: "other",
      countryCode: cc("DE"),
      label: "Client visit",
    };
    const map: WorkLocationMap = new Map([["2026-01-05", OTHER_LABELED]]);
    const result = aggregateLocationCounts(map);
    expect(result[0].label).toBe("Client visit");
  });

  it("skips entries with unknown locations and does not collide on separator characters in other fields", () => {
    // Defensive case: corrupted/tampered storage values with unknown locations are skipped.
    // Valid entries with separator characters in countryCode/label must not be merged.
    const entry1 = {
      location: "other:site", // invalid — skipped by guard
      countryCode: "DE",
      label: "foo:bar",
    } as unknown as WorkLocationInfo;
    const entry2 = {
      location: "other",
      countryCode: "DE:FR", // separator in countryCode
      label: "baz",
    } as unknown as WorkLocationInfo;
    const entry3 = {
      location: "other",
      countryCode: "DE",
      label: "foo:bar", // separator in label
    } as unknown as WorkLocationInfo;
    const map: WorkLocationMap = new Map([
      ["2026-01-01", entry1],
      ["2026-01-02", entry2],
      ["2026-01-03", entry3],
    ]);
    const result = aggregateLocationCounts(map);
    // entry1 is skipped (unknown location); entry2 and entry3 are distinct rows
    expect(result).toHaveLength(2);
  });
});
