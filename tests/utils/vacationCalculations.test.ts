import { describe, expect, it } from "vitest";
import type { HdayEvent } from "../../src/lib/hday/types";
import {
  calculateVacationStats,
  formatVacationValue,
  getAllowanceDays,
  getAllowanceHours,
  getAvailableYears,
  getHalfDayLabel,
  sanitizeVacationAllowance,
  type VacationAllowanceSettings,
} from "../../src/utils/vacationCalculations";

describe("vacationCalculations", () => {
  describe("getEventTypeKey logic", () => {
    it("should return holiday for events with no flags", () => {
      const events: HdayEvent[] = [{ type: "range", start: "2025/01/15", end: "2025/01/15" }];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(1);
    });

    it("should return holiday for events with empty flags array", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: [] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(1);
    });

    it("should return holiday for events with explicit holiday flag", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(1);
    });

    it("should use holiday flag when no explicit type flags are present and handle half-day modifiers", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday", "half_am"],
        },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(0.5); // Half day holiday
    });

    it("should prioritize explicit type flags over holiday flag", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/01/15",
          end: "2025/01/17",
          flags: ["holiday", "business"],
        },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(0); // Should not count as holiday
      const businessType = stats.byType.find((t) => t.key === "business");
      expect(businessType?.days).toBe(3); // Should count as business
    });

    it("should correctly classify business trip events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/17", flags: ["business"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(0);
      const businessType = stats.byType.find((t) => t.key === "business");
      expect(businessType?.days).toBe(3);
    });

    it("should correctly classify course/training events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/16", flags: ["course"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      const courseType = stats.byType.find((t) => t.key === "course");
      expect(courseType?.days).toBe(2);
    });

    it("should correctly classify in-office events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: ["in"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      const inType = stats.byType.find((t) => t.key === "in");
      expect(inType?.days).toBe(1);
    });

    it("should correctly classify weekend events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/18", end: "2025/01/19", flags: ["weekend"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      const weekendType = stats.byType.find((t) => t.key === "weekend");
      expect(weekendType?.days).toBe(2);
    });

    it("should correctly classify birthday events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/03/10", end: "2025/03/10", flags: ["birthday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      const birthdayType = stats.byType.find((t) => t.key === "birthday");
      expect(birthdayType?.days).toBe(1);
    });

    it("should correctly classify sick leave events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/02/10", end: "2025/02/12", flags: ["ill"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      const illType = stats.byType.find((t) => t.key === "ill");
      expect(illType?.days).toBe(3);
    });

    it("should correctly classify other events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/04/01", end: "2025/04/01", flags: ["other"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      const otherType = stats.byType.find((t) => t.key === "other");
      expect(otherType?.days).toBe(1);
    });
  });

  describe("calculateVacationStats", () => {
    it("should calculate stats for single day event", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.year).toBe(2025);
      expect(stats.totalDays).toBe(1);
      expect(stats.totalHours).toBe(8);
      expect(stats.holidayDays).toBe(1);
      expect(stats.holidayHours).toBe(8);
    });

    it("should calculate stats for multi-day event", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/20", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.totalDays).toBe(6);
      expect(stats.totalHours).toBe(48);
      expect(stats.holidayDays).toBe(6);
    });

    it("should handle half day events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: ["holiday", "half_am"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(0.5);
      expect(stats.holidayHours).toBe(4);
    });

    it("should not count half day if both AM and PM flags present", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday", "half_am", "half_pm"],
        },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(1); // Full day
    });

    it("should calculate stats for weekly recurring events", () => {
      const events: HdayEvent[] = [{ type: "weekly", weekday: 1, flags: ["in"] }]; // Every Monday
      const stats = calculateVacationStats(events, 2025, 8);
      const inType = stats.byType.find((t) => t.key === "in");
      expect(inType?.days).toBeGreaterThan(50); // ~52 Mondays in a year
      expect(inType?.days).toBeLessThan(54);
    });

    it("should filter events by year correctly", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2024/12/20", end: "2024/12/31", flags: ["holiday"] },
        { type: "range", start: "2025/01/01", end: "2025/01/10", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(10); // Only January days
    });

    it("should handle events spanning year boundaries", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2024/12/28", end: "2025/01/05", flags: ["holiday"] },
      ];
      const stats2024 = calculateVacationStats(events, 2024, 8);
      const stats2025 = calculateVacationStats(events, 2025, 8);
      expect(stats2024.holidayDays).toBe(4); // Dec 28-31
      expect(stats2025.holidayDays).toBe(5); // Jan 1-5
    });

    it("should respect custom hoursPerDay setting", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: ["holiday"] },
      ];
      const stats7h = calculateVacationStats(events, 2025, 7);
      const stats10h = calculateVacationStats(events, 2025, 10);
      expect(stats7h.holidayHours).toBe(7);
      expect(stats10h.holidayHours).toBe(10);
    });

    it("should ignore unknown event types", () => {
      const events: HdayEvent[] = [
        { type: "unknown", raw: "invalid line" },
        { type: "range", start: "2025/01/15", end: "2025/01/15", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(1); // Only the valid event
    });

    it("should handle multiple events of different types", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/15", end: "2025/01/17", flags: ["holiday"] },
        { type: "range", start: "2025/02/10", end: "2025/02/12", flags: ["business"] },
        { type: "range", start: "2025/03/05", end: "2025/03/05", flags: ["ill"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.totalDays).toBe(7);
      expect(stats.holidayDays).toBe(3);
      const businessType = stats.byType.find((t) => t.key === "business");
      const illType = stats.byType.find((t) => t.key === "ill");
      expect(businessType?.days).toBe(3);
      expect(illType?.days).toBe(1);
    });

    it("should handle inverted date ranges gracefully", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2025/01/20", end: "2025/01/15", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(0); // Invalid range
    });

    it("should handle invalid dates gracefully", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "invalid", end: "2025/01/15", flags: ["holiday"] },
      ];
      const stats = calculateVacationStats(events, 2025, 8);
      expect(stats.holidayDays).toBe(0);
    });
  });

  describe("getAvailableYears", () => {
    it("should return fallback year when no events", () => {
      const years = getAvailableYears([], 2025);
      expect(years).toEqual([2025]);
    });

    it("should extract years from range events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2024/06/15", end: "2024/06/20" },
        { type: "range", start: "2025/01/10", end: "2025/01/15" },
      ];
      const years = getAvailableYears(events, 2025);
      expect(years).toContain(2024);
      expect(years).toContain(2025);
    });

    it("should handle events spanning multiple years", () => {
      const events: HdayEvent[] = [{ type: "range", start: "2023/12/28", end: "2024/01/05" }];
      const years = getAvailableYears(events, 2025);
      expect(years).toContain(2023);
      expect(years).toContain(2024);
      expect(years).toContain(2025); // Fallback
    });

    it("should return sorted years in descending order", () => {
      const events: HdayEvent[] = [
        { type: "range", start: "2023/01/01", end: "2023/01/01" },
        { type: "range", start: "2025/01/01", end: "2025/01/01" },
        { type: "range", start: "2024/01/01", end: "2024/01/01" },
      ];
      const years = getAvailableYears(events, 2025);
      expect(years[0]).toBeGreaterThan(years[1]);
      expect(years[1]).toBeGreaterThan(years[2]);
    });

    it("should ignore weekly events", () => {
      const events: HdayEvent[] = [
        { type: "weekly", weekday: 1 },
        { type: "range", start: "2024/01/01", end: "2024/01/01" },
      ];
      const years = getAvailableYears(events, 2025);
      expect(years).toContain(2024);
      expect(years).toContain(2025);
      expect(years).toHaveLength(2);
    });

    it("should handle invalid dates gracefully", () => {
      const events: HdayEvent[] = [{ type: "range", start: "invalid", end: "2024/01/01" }];
      const years = getAvailableYears(events, 2025);
      expect(years).toEqual([2025]); // Only fallback
    });
  });

  describe("getAllowanceDays", () => {
    it("should return amount when unit is days", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 25,
        unit: "days",
        hoursPerDay: 8,
      };
      expect(getAllowanceDays(allowance)).toBe(25);
    });

    it("should convert hours to days", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 200,
        unit: "hours",
        hoursPerDay: 8,
      };
      expect(getAllowanceDays(allowance)).toBe(25); // 200 / 8 = 25
    });

    it("should handle decimal conversion", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 180,
        unit: "hours",
        hoursPerDay: 8,
      };
      expect(getAllowanceDays(allowance)).toBe(22.5); // 180 / 8 = 22.5
    });

    it("should return 0 when hoursPerDay is 0 or negative", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 200,
        unit: "hours",
        hoursPerDay: 0,
      };
      expect(getAllowanceDays(allowance)).toBe(0);
    });
  });

  describe("getAllowanceHours", () => {
    it("should return amount when unit is hours", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 200,
        unit: "hours",
        hoursPerDay: 8,
      };
      expect(getAllowanceHours(allowance)).toBe(200);
    });

    it("should convert days to hours", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 25,
        unit: "days",
        hoursPerDay: 8,
      };
      expect(getAllowanceHours(allowance)).toBe(200); // 25 * 8 = 200
    });

    it("should handle custom hoursPerDay", () => {
      const allowance: VacationAllowanceSettings = {
        amount: 25,
        unit: "days",
        hoursPerDay: 7.5,
      };
      expect(getAllowanceHours(allowance)).toBe(187.5); // 25 * 7.5
    });
  });

  describe("sanitizeVacationAllowance", () => {
    const fallback: VacationAllowanceSettings = {
      amount: 25,
      unit: "days",
      hoursPerDay: 8,
    };

    it("should use fallback when allowance is undefined", () => {
      const result = sanitizeVacationAllowance(undefined, fallback);
      expect(result).toEqual(fallback);
    });

    it("should sanitize negative amount to 0", () => {
      const result = sanitizeVacationAllowance({ amount: -5 }, fallback);
      expect(result.amount).toBe(0);
    });

    it("should sanitize NaN amount to fallback", () => {
      const result = sanitizeVacationAllowance({ amount: NaN }, fallback);
      expect(result.amount).toBe(fallback.amount);
    });

    it("should sanitize Infinity amount to fallback", () => {
      const result = sanitizeVacationAllowance({ amount: Infinity }, fallback);
      expect(result.amount).toBe(fallback.amount);
    });

    it("should accept valid amount", () => {
      const result = sanitizeVacationAllowance({ amount: 30 }, fallback);
      expect(result.amount).toBe(30);
    });

    it("should accept valid unit", () => {
      const result = sanitizeVacationAllowance({ unit: "hours" }, fallback);
      expect(result.unit).toBe("hours");
    });

    it("should use fallback for invalid unit", () => {
      const result = sanitizeVacationAllowance({ unit: "weeks" as any }, fallback);
      expect(result.unit).toBe(fallback.unit);
    });

    it("should sanitize hoursPerDay less than 1 to 1", () => {
      const result = sanitizeVacationAllowance({ hoursPerDay: 0.5 }, fallback);
      expect(result.hoursPerDay).toBe(1);
    });

    it("should sanitize negative hoursPerDay to 1", () => {
      const result = sanitizeVacationAllowance({ hoursPerDay: -1 }, fallback);
      expect(result.hoursPerDay).toBe(1);
    });

    it("should accept valid hoursPerDay", () => {
      const result = sanitizeVacationAllowance({ hoursPerDay: 7.5 }, fallback);
      expect(result.hoursPerDay).toBe(7.5);
    });

    it("should sanitize partial allowance with multiple invalid fields", () => {
      const result = sanitizeVacationAllowance(
        { amount: -10, unit: "invalid" as any, hoursPerDay: -5 },
        fallback,
      );
      expect(result.amount).toBe(0);
      expect(result.unit).toBe(fallback.unit);
      expect(result.hoursPerDay).toBe(1);
    });

    it("should merge partial allowance with fallback", () => {
      const result = sanitizeVacationAllowance({ amount: 30 }, fallback);
      expect(result.amount).toBe(30);
      expect(result.unit).toBe(fallback.unit);
      expect(result.hoursPerDay).toBe(fallback.hoursPerDay);
    });
  });

  describe("formatVacationValue", () => {
    it("should format integer values without decimals", () => {
      expect(formatVacationValue(25)).toBe("25");
      expect(formatVacationValue(0)).toBe("0");
      expect(formatVacationValue(100)).toBe("100");
    });

    it("should format decimal values with 1 decimal place", () => {
      expect(formatVacationValue(25.5)).toBe("25.5");
      expect(formatVacationValue(0.5)).toBe("0.5");
      expect(formatVacationValue(99.9)).toBe("99.9");
    });

    it("should round to 1 decimal place", () => {
      expect(formatVacationValue(25.66)).toBe("25.7");
      expect(formatVacationValue(25.44)).toBe("25.4");
    });

    it("should handle NaN by returning 0", () => {
      expect(formatVacationValue(NaN)).toBe("0");
    });

    it("should handle negative values", () => {
      expect(formatVacationValue(-5)).toBe("-5");
      expect(formatVacationValue(-5.5)).toBe("-5.5");
    });
  });

  describe("getHalfDayLabel", () => {
    it("should return null for no flags", () => {
      expect(getHalfDayLabel(undefined)).toBeNull();
      expect(getHalfDayLabel([])).toBeNull();
    });

    it("should return Half day for half_am flag only", () => {
      expect(getHalfDayLabel(["half_am"])).toBe("Half day");
    });

    it("should return Half day for half_pm flag only", () => {
      expect(getHalfDayLabel(["half_pm"])).toBe("Half day");
    });

    it("should return null when both half_am and half_pm present", () => {
      expect(getHalfDayLabel(["half_am", "half_pm"])).toBeNull();
    });

    it("should return Half day for half_am with other flags", () => {
      expect(getHalfDayLabel(["half_am", "holiday"])).toBe("Half day");
    });

    it("should return null for flags without half day markers", () => {
      expect(getHalfDayLabel(["holiday", "business"])).toBeNull();
    });
  });
});
