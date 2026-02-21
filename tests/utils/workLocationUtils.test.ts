import { describe, it, expect } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import {
  getWfhDaysInWeek,
  getLocationCountsInWeek,
  aggregateLocationsByYear,
} from "../../src/utils/workLocationUtils";
import type { WorkLocationMap } from "../../src/types/workLocation";

const HOME = { location: "home" as const, countryCode: "NL" };
const OFFICE = { location: "office" as const, countryCode: "BE" };
const OTHER_DE = { location: "other" as const, countryCode: "DE" };

// ISO week 8 of 2026: Mon Feb 16 – Sun Feb 22
const MON = "2026/02/16";
const TUE = "2026/02/17";
const WED = "2026/02/18";
const THU = "2026/02/19";
const FRI = "2026/02/20";
const SAT = "2026/02/21";
const SUN = "2026/02/22";
// Day in the previous ISO week
const PREV_FRI = "2026/02/13";

describe("getWfhDaysInWeek", () => {
  it("returns 0 for an empty map", () => {
    const map: WorkLocationMap = new Map();
    expect(getWfhDaysInWeek(dayjs("2026-02-18"), map)).toBe(0);
  });

  it("counts WFH days in the ISO week", () => {
    const map: WorkLocationMap = new Map([
      [MON, HOME],
      [WED, HOME],
      [FRI, HOME],
    ]);
    expect(getWfhDaysInWeek(dayjs("2026-02-18"), map)).toBe(3);
  });

  it("ignores office entries", () => {
    const map: WorkLocationMap = new Map([
      [MON, OFFICE],
      [TUE, HOME],
    ]);
    expect(getWfhDaysInWeek(dayjs("2026-02-16"), map)).toBe(1);
  });

  it("does not count WFH days from adjacent weeks", () => {
    const map: WorkLocationMap = new Map([
      [PREV_FRI, HOME], // previous week – must not be counted
      [MON, HOME],
    ]);
    expect(getWfhDaysInWeek(dayjs("2026-02-18"), map)).toBe(1);
  });

  it("counts all 7 days when every day of the week is WFH", () => {
    const map: WorkLocationMap = new Map([
      [MON, HOME],
      [TUE, HOME],
      [WED, HOME],
      [THU, HOME],
      [FRI, HOME],
      [SAT, HOME],
      [SUN, HOME],
    ]);
    expect(getWfhDaysInWeek(dayjs("2026-02-20"), map)).toBe(7);
  });

  it("gives the same result regardless of which day of the week is used as input", () => {
    const map: WorkLocationMap = new Map([[MON, HOME], [FRI, HOME]]);
    expect(getWfhDaysInWeek(dayjs("2026-02-16"), map)).toBe(2); // Monday
    expect(getWfhDaysInWeek(dayjs("2026-02-18"), map)).toBe(2); // Wednesday
    expect(getWfhDaysInWeek(dayjs("2026-02-22"), map)).toBe(2); // Sunday
  });
});

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
    expect(getLocationCountsInWeek(dayjs("2026-02-16"), map)).toEqual({ home: 1, office: 1, other: 0 });
    expect(getLocationCountsInWeek(dayjs("2026-02-18"), map)).toEqual({ home: 1, office: 1, other: 0 });
    expect(getLocationCountsInWeek(dayjs("2026-02-22"), map)).toEqual({ home: 1, office: 1, other: 0 });
  });
});

describe("aggregateLocationsByYear", () => {
  it("returns an empty array for an empty map", () => {
    expect(aggregateLocationsByYear(new Map())).toEqual([]);
  });

  it("groups entries by (location, countryCode) and sums day counts", () => {
    const map: WorkLocationMap = new Map([
      ["2026/01/05", HOME],
      ["2026/01/06", HOME],
      ["2026/01/07", OFFICE],
    ]);
    const result = aggregateLocationsByYear(map);
    // Two distinct groups
    expect(result).toHaveLength(2);
    const homeRow = result.find((r) => r.location === "home");
    const officeRow = result.find((r) => r.location === "office");
    expect(homeRow).toEqual({ location: "home", countryCode: "NL", days: 2 });
    expect(officeRow).toEqual({ location: "office", countryCode: "BE", days: 1 });
  });

  it("sorts by days descending", () => {
    const map: WorkLocationMap = new Map([
      ["2026/01/05", OFFICE],
      ["2026/01/06", HOME],
      ["2026/01/07", HOME],
      ["2026/01/08", HOME],
    ]);
    const result = aggregateLocationsByYear(map);
    expect(result[0].days).toBeGreaterThanOrEqual(result[1].days);
  });

  it("creates separate rows for other-location entries with different country codes", () => {
    const OTHER_US = { location: "other" as const, countryCode: "US" };
    const map: WorkLocationMap = new Map([
      ["2026/01/05", OTHER_DE],
      ["2026/01/06", OTHER_US],
      ["2026/01/07", OTHER_DE],
    ]);
    const result = aggregateLocationsByYear(map);
    expect(result).toHaveLength(2);
    const deRow = result.find((r) => r.countryCode === "DE");
    const usRow = result.find((r) => r.countryCode === "US");
    expect(deRow?.days).toBe(2);
    expect(usRow?.days).toBe(1);
  });

  it("creates separate rows for other-location entries with the same country but different labels", () => {
    const OTHER_DE_LABEL = { location: "other" as const, countryCode: "DE", label: "Berlin office" };
    const OTHER_DE_NOLABEL = { location: "other" as const, countryCode: "DE" };
    const map: WorkLocationMap = new Map([
      ["2026/01/05", OTHER_DE_LABEL],
      ["2026/01/06", OTHER_DE_NOLABEL],
    ]);
    const result = aggregateLocationsByYear(map);
    expect(result).toHaveLength(2);
  });

  it("preserves the label on other-location rows", () => {
    const OTHER_LABELED = { location: "other" as const, countryCode: "DE", label: "Client visit" };
    const map: WorkLocationMap = new Map([["2026/01/05", OTHER_LABELED]]);
    const result = aggregateLocationsByYear(map);
    expect(result[0].label).toBe("Client visit");
  });
});
