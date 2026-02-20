import { describe, expect, it } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import {
  getWfhDaysInWeek,
  getWfhDaysInMonth,
  isWfhLimitExceeded,
} from "../../src/utils/workLocationUtils";
import type { WorkLocationMap } from "../../src/types/workLocation";

describe("workLocationUtils", () => {
  describe("getWfhDaysInWeek", () => {
    it("should return 0 for an empty work location map", () => {
      const map: WorkLocationMap = new Map();
      const date = dayjs("2026-02-18"); // Wednesday
      expect(getWfhDaysInWeek(date, map)).toBe(0);
    });

    it("should count WFH days in the ISO week", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }], // Monday
        ["2026/02/17", { location: "home", countryCode: "NL" }], // Tuesday
        ["2026/02/18", { location: "office", countryCode: "BE" }], // Wednesday
        ["2026/02/19", { location: "home", countryCode: "NL" }], // Thursday
      ]);
      const date = dayjs("2026-02-18"); // Wednesday in this week
      expect(getWfhDaysInWeek(date, map)).toBe(3); // Mon, Tue, Thu
    });

    it("should work for any date within the ISO week", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }], // Monday
        ["2026/02/20", { location: "home", countryCode: "DE" }], // Friday
      ]);

      // Test different days in the same week
      expect(getWfhDaysInWeek(dayjs("2026-02-16"), map)).toBe(2); // Monday
      expect(getWfhDaysInWeek(dayjs("2026-02-18"), map)).toBe(2); // Wednesday
      expect(getWfhDaysInWeek(dayjs("2026-02-22"), map)).toBe(2); // Sunday
    });

    it("should not count office days", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "office", countryCode: "BE" }],
        ["2026/02/17", { location: "office", countryCode: "BE" }],
        ["2026/02/18", { location: "office", countryCode: "BE" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(getWfhDaysInWeek(date, map)).toBe(0);
    });

    it("should handle all 7 days of the week being WFH", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }], // Monday
        ["2026/02/17", { location: "home", countryCode: "NL" }], // Tuesday
        ["2026/02/18", { location: "home", countryCode: "NL" }], // Wednesday
        ["2026/02/19", { location: "home", countryCode: "NL" }], // Thursday
        ["2026/02/20", { location: "home", countryCode: "NL" }], // Friday
        ["2026/02/21", { location: "home", countryCode: "NL" }], // Saturday
        ["2026/02/22", { location: "home", countryCode: "NL" }], // Sunday
      ]);
      const date = dayjs("2026-02-18");
      expect(getWfhDaysInWeek(date, map)).toBe(7);
    });

    it("should only count days in the ISO week boundaries", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/15", { location: "home", countryCode: "NL" }], // Sunday (prev week)
        ["2026/02/16", { location: "home", countryCode: "NL" }], // Monday (this week)
        ["2026/02/23", { location: "home", countryCode: "NL" }], // Monday (next week)
      ]);
      const date = dayjs("2026-02-18"); // Wednesday
      expect(getWfhDaysInWeek(date, map)).toBe(1); // Only Monday Feb 16
    });

    it("should handle different country codes for WFH days", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
        ["2026/02/17", { location: "home", countryCode: "DE" }],
        ["2026/02/18", { location: "home", countryCode: "FR" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(getWfhDaysInWeek(date, map)).toBe(3);
    });
  });

  describe("getWfhDaysInMonth", () => {
    it("should return 0 for an empty work location map", () => {
      const map: WorkLocationMap = new Map();
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(0);
    });

    it("should count WFH days in the specified month", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/03", { location: "home", countryCode: "NL" }],
        ["2026/02/10", { location: "home", countryCode: "NL" }],
        ["2026/02/17", { location: "home", countryCode: "NL" }],
        ["2026/02/24", { location: "home", countryCode: "NL" }],
        ["2026/02/28", { location: "office", countryCode: "BE" }], // Office, not counted
      ]);
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(4);
    });

    it("should not count days from other months", () => {
      const map: WorkLocationMap = new Map([
        ["2026/01/31", { location: "home", countryCode: "NL" }], // January
        ["2026/02/01", { location: "home", countryCode: "NL" }], // February
        ["2026/02/28", { location: "home", countryCode: "NL" }], // February
        ["2026/03/01", { location: "home", countryCode: "NL" }], // March
      ]);
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(2); // Only Feb 1 and Feb 28
    });

    it("should handle months with different day counts", () => {
      const jan = new Map([
        ["2026/01/15", { location: "home", countryCode: "NL" }],
      ]);
      const feb = new Map([
        ["2026/02/15", { location: "home", countryCode: "NL" }],
      ]);
      const apr = new Map([
        ["2026/04/15", { location: "home", countryCode: "NL" }],
      ]);

      expect(getWfhDaysInMonth(2026, 1, jan)).toBe(1); // 31 days
      expect(getWfhDaysInMonth(2026, 2, feb)).toBe(1); // 28 days (non-leap)
      expect(getWfhDaysInMonth(2026, 4, apr)).toBe(1); // 30 days
    });

    it("should handle leap year February", () => {
      const map: WorkLocationMap = new Map([
        ["2024/02/29", { location: "home", countryCode: "NL" }],
      ]);
      expect(getWfhDaysInMonth(2024, 2, map)).toBe(1);
    });

    it("should count all days in a month if all are WFH", () => {
      const map: WorkLocationMap = new Map();
      // Add all days in February 2026 (28 days)
      for (let d = 1; d <= 28; d++) {
        const dateStr = `2026/02/${String(d).padStart(2, "0")}`;
        map.set(dateStr, { location: "home", countryCode: "NL" });
      }
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(28);
    });

    it("should not count office days", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/01", { location: "office", countryCode: "BE" }],
        ["2026/02/02", { location: "office", countryCode: "BE" }],
        ["2026/02/03", { location: "office", countryCode: "BE" }],
      ]);
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(0);
    });

    it("should handle mixed WFH and office days", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/02", { location: "home", countryCode: "NL" }],    // Mon (WFH)
        ["2026/02/03", { location: "office", countryCode: "BE" }],  // Tue
        ["2026/02/04", { location: "home", countryCode: "NL" }],    // Wed (WFH)
        ["2026/02/05", { location: "office", countryCode: "BE" }],  // Thu
        ["2026/02/06", { location: "home", countryCode: "NL" }],    // Fri (WFH)
      ]);
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(3);
    });

    it("should handle different country codes", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/02", { location: "home", countryCode: "NL" }],
        ["2026/02/03", { location: "home", countryCode: "DE" }],
        ["2026/02/04", { location: "home", countryCode: "FR" }],
      ]);
      expect(getWfhDaysInMonth(2026, 2, map)).toBe(3);
    });
  });

  describe("isWfhLimitExceeded", () => {
    it("should return false when WFH days equal the limit", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
        ["2026/02/17", { location: "home", countryCode: "NL" }],
        ["2026/02/18", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 3)).toBe(false);
    });

    it("should return true when WFH days exceed the limit", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
        ["2026/02/17", { location: "home", countryCode: "NL" }],
        ["2026/02/18", { location: "home", countryCode: "NL" }],
        ["2026/02/19", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 3)).toBe(true);
    });

    it("should return false when WFH days are below the limit", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
        ["2026/02/17", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 3)).toBe(false);
    });

    it("should return false for zero limit with no WFH days", () => {
      const map: WorkLocationMap = new Map();
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 0)).toBe(false);
    });

    it("should return true for zero limit with any WFH days", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 0)).toBe(true);
    });

    it("should handle high limits correctly", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
        ["2026/02/17", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 100)).toBe(false);
    });

    it("should correctly check limit for edge cases", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");

      expect(isWfhLimitExceeded(date, map, 0)).toBe(true);  // 1 > 0
      expect(isWfhLimitExceeded(date, map, 1)).toBe(false); // 1 > 1 is false
      expect(isWfhLimitExceeded(date, map, 2)).toBe(false); // 1 > 2 is false
    });

    it("should check the ISO week containing the given date", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/15", { location: "home", countryCode: "NL" }], // Sunday (prev week)
        ["2026/02/16", { location: "home", countryCode: "NL" }], // Monday (this week)
        ["2026/02/17", { location: "home", countryCode: "NL" }], // Tuesday (this week)
      ]);
      const date = dayjs("2026-02-18"); // Wednesday
      expect(isWfhLimitExceeded(date, map, 2)).toBe(false); // Only 2 days in this week
    });
  });

  describe("edge cases and boundary testing", () => {
    it("should handle year boundaries correctly", () => {
      const map: WorkLocationMap = new Map([
        ["2025/12/29", { location: "home", countryCode: "NL" }], // Monday, week 1 of 2026
        ["2026/01/02", { location: "home", countryCode: "NL" }], // Friday, week 1 of 2026
      ]);
      const date = dayjs("2025-12-31"); // Wednesday in ISO week 1 of 2026
      expect(getWfhDaysInWeek(date, map)).toBe(2);
    });

    it("should handle month with 31 days", () => {
      const map: WorkLocationMap = new Map([
        ["2026/01/31", { location: "home", countryCode: "NL" }],
      ]);
      expect(getWfhDaysInMonth(2026, 1, map)).toBe(1);
    });

    it("should handle negative limits gracefully", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      // Any positive count > negative limit
      expect(isWfhLimitExceeded(date, map, -1)).toBe(true);
    });

    it("should handle fractional limits", () => {
      const map: WorkLocationMap = new Map([
        ["2026/02/16", { location: "home", countryCode: "NL" }],
      ]);
      const date = dayjs("2026-02-18");
      expect(isWfhLimitExceeded(date, map, 0.5)).toBe(true);  // 1 > 0.5
      expect(isWfhLimitExceeded(date, map, 1.5)).toBe(false); // 1 > 1.5 is false
    });
  });
});