import { describe, it, expect } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import { getWfhDaysInWeek, isWfhLimitExceeded } from "../../src/utils/workLocationUtils";
import type { WorkLocationMap } from "../../src/types/workLocation";

const HOME = { location: "home" as const, countryCode: "NL" as const };
const OFFICE = { location: "office" as const, countryCode: "BE" as const };

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

describe("isWfhLimitExceeded", () => {
  it("returns false when WFH count is below the limit", () => {
    const map: WorkLocationMap = new Map([[MON, HOME]]);
    expect(isWfhLimitExceeded(dayjs("2026-02-18"), map, 2)).toBe(false);
  });

  it("returns false when WFH count equals the limit exactly", () => {
    const map: WorkLocationMap = new Map([[MON, HOME], [TUE, HOME]]);
    expect(isWfhLimitExceeded(dayjs("2026-02-18"), map, 2)).toBe(false);
  });

  it("returns true when WFH count strictly exceeds the limit", () => {
    const map: WorkLocationMap = new Map([[MON, HOME], [TUE, HOME], [WED, HOME]]);
    expect(isWfhLimitExceeded(dayjs("2026-02-18"), map, 2)).toBe(true);
  });

  it("returns false for an empty map regardless of limit", () => {
    const map: WorkLocationMap = new Map();
    expect(isWfhLimitExceeded(dayjs("2026-02-18"), map, 0)).toBe(false);
  });

  it("returns true when limit is 0 and any WFH day exists", () => {
    const map: WorkLocationMap = new Map([[MON, HOME]]);
    expect(isWfhLimitExceeded(dayjs("2026-02-18"), map, 0)).toBe(true);
  });
});
