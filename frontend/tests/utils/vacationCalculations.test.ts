import { describe, expect, it } from "vitest";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "@/lib/timeOff/codecs";
import {
  calculateVacationStats,
  formatVacationValue,
  getAvailableYears,
  getHalfDayLabel,
  sanitizeVacationAllowance,
  type VacationAllowanceSettings,
} from "@/utils/vacationCalculations";

const dateEntry = (
  date: string,
  entryType:
    | "vacation"
    | "business"
    | "course"
    | "in"
    | "weekend"
    | "birthday"
    | "ill"
    | "other" = "vacation",
  entryFlag: "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly" | "full_day" = "full_day",
) =>
  buildTimeOffEntryForRange({
    start: date,
    end: date,
    note: null,
    entryType,
    entryFlag,
  });

const rangeEntry = (
  start: string,
  end: string,
  entryType:
    | "vacation"
    | "business"
    | "course"
    | "in"
    | "weekend"
    | "birthday"
    | "ill"
    | "other" = "vacation",
  entryFlag: "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly" | "full_day" = "full_day",
) =>
  buildTimeOffEntryForRange({
    start,
    end,
    note: null,
    entryType,
    entryFlag,
  });

const weeklyEntry = (
  weekday: number,
  entryType:
    | "vacation"
    | "business"
    | "course"
    | "in"
    | "weekend"
    | "birthday"
    | "ill"
    | "other" = "in",
  entryFlag: "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly" | "full_day" = "full_day",
) =>
  createWeeklyTimeOffEntry({
    weekday,
    note: null,
    entryType,
    entryFlag,
  });

describe("vacationCalculations", () => {
  describe("calculateVacationStats", () => {
    it("treats date entries as vacation by default", () => {
      const stats = calculateVacationStats([dateEntry("2025-01-15")], 2025);
      expect(stats.byType.find((t) => t.key === "holiday")?.days).toBe(1);
    });

    it("classifies non-vacation entry types correctly", () => {
      const stats = calculateVacationStats(
        [
          rangeEntry("2025-01-15", "2025-01-17", "business"),
          rangeEntry("2025-02-10", "2025-02-11", "course"),
          dateEntry("2025-03-01", "ill"),
        ],
        2025,
      );

      expect(stats.byType.find((t) => t.key === "holiday")?.days).toBe(0);
      expect(stats.byType.find((t) => t.key === "business")?.days).toBe(3);
      expect(stats.byType.find((t) => t.key === "course")?.days).toBe(2);
      expect(stats.byType.find((t) => t.key === "ill")?.days).toBe(1);
    });

    it("counts range entries across all covered days", () => {
      const stats = calculateVacationStats([rangeEntry("2025-01-15", "2025-01-20")], 2025);
      expect(stats.totalDays).toBe(6);
    });

    it("handles half-day flags", () => {
      const halfStats = calculateVacationStats(
        [dateEntry("2025-01-15", "vacation", "half_am")],
        2025,
      );
      expect(halfStats.byType.find((t) => t.key === "holiday")?.days).toBe(0.5);

      const fullStats = calculateVacationStats([dateEntry("2025-01-15", "vacation")], 2025);
      expect(fullStats.byType.find((t) => t.key === "holiday")?.days).toBe(1);
    });

    it("counts weekly recurring entries for the selected year", () => {
      const stats = calculateVacationStats([weeklyEntry(1, "in")], 2025);
      expect(stats.byType.find((t) => t.key === "in")?.days).toBeGreaterThan(50);
      expect(stats.byType.find((t) => t.key === "in")?.days).toBeLessThan(54);
    });

    it("clamps range entries to the selected year", () => {
      const stats2024 = calculateVacationStats([rangeEntry("2024-12-28", "2025-01-05")], 2024);
      const stats2025 = calculateVacationStats([rangeEntry("2024-12-28", "2025-01-05")], 2025);
      expect(stats2024.byType.find((t) => t.key === "holiday")?.days).toBe(4);
      expect(stats2025.byType.find((t) => t.key === "holiday")?.days).toBe(5);
    });

    it("ignores invalid inverted ranges", () => {
      const stats = calculateVacationStats([rangeEntry("2025-01-20", "2025-01-15")], 2025);
      expect(stats.byType.find((t) => t.key === "holiday")?.days).toBe(0);
    });
  });

  describe("getAvailableYears", () => {
    it("returns the fallback year when there are no entries", () => {
      expect(getAvailableYears([], 2025)).toEqual([2025]);
    });

    it("extracts years from date and range entries", () => {
      const years = getAvailableYears(
        [dateEntry("2024-06-15"), rangeEntry("2023-12-28", "2024-01-05"), weeklyEntry(1)],
        2025,
      );
      expect(years).toEqual([2025, 2024, 2023]);
    });

    it("returns descending years", () => {
      const years = getAvailableYears(
        [dateEntry("2023-01-01"), dateEntry("2025-01-01"), dateEntry("2024-01-01")],
        2025,
      );
      expect(years).toEqual([2025, 2024, 2023]);
    });
  });

  describe("sanitizeVacationAllowance", () => {
    const fallback: VacationAllowanceSettings = {
      yearlyAmounts: { "2025": 25 },
      unit: "days",
      hoursPerDay: 8,
    };

    it("sanitizes invalid allowance fields", () => {
      const result = sanitizeVacationAllowance(
        { yearlyAmounts: { "2025": -10, "2026": 20 }, unit: "invalid" as never, hoursPerDay: -5 },
        fallback,
      );
      expect(result.yearlyAmounts).toEqual({ "2025": 25, "2026": 20 });
      expect(result.unit).toBe("days");
      expect(result.hoursPerDay).toBe(1);
    });
  });

  describe("formatVacationValue", () => {
    it("formats integers and decimals", () => {
      expect(formatVacationValue(25)).toBe("25");
      expect(formatVacationValue(25.5)).toBe("25.5");
      expect(formatVacationValue(25.66)).toBe("25.7");
      expect(formatVacationValue(NaN)).toBe("0");
    });
  });

  describe("getHalfDayLabel", () => {
    it("returns Half day when a half-day flag is set", () => {
      expect(getHalfDayLabel(undefined)).toBeNull();
      expect(getHalfDayLabel(null)).toBeNull();
      expect(getHalfDayLabel("half_am")).toBe("Half day");
      expect(getHalfDayLabel("half_pm")).toBe("Half day");
      expect(getHalfDayLabel("onsite")).toBeNull();
    });
  });
});
