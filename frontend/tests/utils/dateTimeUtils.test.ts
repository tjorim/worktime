import { describe, expect, it } from "vitest";
import {
  dayjs,
  formatYYWWD,
  getISOWeek2Digit,
  getISOWeekday,
  getISOWeekYear2Digit,
  getLocalizedShiftTime,
} from "../../src/utils/dateTimeUtils";

describe("Date Time Utils", () => {
  describe("formatYYWWD Function", () => {
    it("should format date code correctly", () => {
      const testDate = new Date("2025-05-13"); // Tuesday, Week 20 of 2025
      const formatted = formatYYWWD(testDate);
      expect(formatted).toBe("2520.2"); // 25=2025, 20=week, 2=Tuesday
    });

    it("should handle Sunday as day 7", () => {
      const sunday = new Date("2025-05-18"); // Sunday
      const formatted = formatYYWWD(sunday);
      expect(formatted).toMatch(/\.7$/); // Should end with .7
    });

    it("should use ISO week for year-end boundary", () => {
      // Dec 31, 2023 is a Sunday, ISO week 52
      const date = new Date("2023-12-31");
      const formatted = formatYYWWD(date);
      expect(formatted).toMatch(/^2352\.7$/); // 23=2023, 52=ISO week, 7=Sunday
    });

    it("should use ISO week for first week of year", () => {
      // Jan 1, 2024 is a Monday, ISO week 1
      const date = new Date("2024-01-01");
      const formatted = formatYYWWD(date);
      expect(formatted).toMatch(/^2401\.1$/); // 24=2024, 01=ISO week, 1=Monday
    });

    it("should handle week transition at year boundary", () => {
      // Dec 31, 2024 (Tuesday, ISO week 1 of 2025)
      const date = new Date("2024-12-31");
      const formatted = formatYYWWD(date);
      // ISO week for 2024-12-31 is week 1 of ISO year 2025
      expect(formatted).toBe("2501.2"); // YY=25 (ISO year), WW=01 (ISO week 1), D=2 (Tuesday)
    });

    it("should accept different date formats", () => {
      const testDate = new Date("2025-07-16");
      const stringDate = "2025-07-16";
      const dayjsDate = dayjs("2025-07-16");

      const code1 = formatYYWWD(testDate);
      const code2 = formatYYWWD(stringDate);
      const code3 = formatYYWWD(dayjsDate);

      expect(code1).toBe(code2);
      expect(code2).toBe(code3);
    });

    it("should handle malformed date strings gracefully", () => {
      const malformedDates = ["invalid", "2025-13-01", "2025-02-30", ""];

      malformedDates.forEach((dateStr) => {
        expect(() => formatYYWWD(dateStr)).not.toThrow();
      });
    });

    it("should handle NaN dates gracefully", () => {
      const nanDate = new Date(NaN);
      expect(() => formatYYWWD(nanDate)).not.toThrow();
    });
  });

  describe("ISO Week Helper Functions", () => {
    it("should extract 2-digit ISO week year correctly", () => {
      const date2025 = new Date("2025-05-13");
      const date2024 = new Date("2024-12-31"); // ISO week year 2025

      expect(getISOWeekYear2Digit(date2025)).toBe("25");
      expect(getISOWeekYear2Digit(date2024)).toBe("25"); // ISO week year
    });

    it("should extract 2-digit ISO week number correctly", () => {
      const week20 = new Date("2025-05-13"); // Week 20
      const week01 = new Date("2024-01-01"); // Week 1

      expect(getISOWeek2Digit(week20)).toBe("20");
      expect(getISOWeek2Digit(week01)).toBe("01");
    });

    it("should extract ISO weekday correctly", () => {
      const monday = new Date("2025-05-12"); // Monday
      const tuesday = new Date("2025-05-13"); // Tuesday
      const sunday = new Date("2025-05-18"); // Sunday

      expect(getISOWeekday(monday)).toBe(1);
      expect(getISOWeekday(tuesday)).toBe(2);
      expect(getISOWeekday(sunday)).toBe(7);
    });
  });

  describe("getLocalizedShiftTime Function", () => {
    it("should format 24h time range correctly", () => {
      const result = getLocalizedShiftTime(7, 15, "24h");
      expect(result).toBe("07:00–15:00");
    });

    it("should format 12h time range correctly", () => {
      const result = getLocalizedShiftTime(7, 15, "12h");
      expect(result).toBe("07:00 AM–03:00 PM");
    });

    it("should handle night shift crossing midnight", () => {
      const result24h = getLocalizedShiftTime(23, 7, "24h");
      const result12h = getLocalizedShiftTime(23, 7, "12h");

      expect(result24h).toBe("23:00–07:00");
      expect(result12h).toBe("11:00 PM–07:00 AM");
    });

    it("should handle single start time", () => {
      const result24h = getLocalizedShiftTime(9, null, "24h");
      const result12h = getLocalizedShiftTime(9, null, "12h");

      expect(result24h).toBe("09:00");
      expect(result12h).toBe("09:00 AM");
    });

    it("should handle single end time", () => {
      const result24h = getLocalizedShiftTime(null, 17, "24h");
      const result12h = getLocalizedShiftTime(null, 17, "12h");

      expect(result24h).toBe("17:00");
      expect(result12h).toBe("05:00 PM");
    });

    it("should return null for invalid inputs", () => {
      expect(getLocalizedShiftTime(null, null, "24h")).toBeNull();
      expect(getLocalizedShiftTime(null, null, "12h")).toBeNull();
    });

    it("should handle midnight (end = 0) correctly", () => {
      const result24h = getLocalizedShiftTime(18, 0, "24h");
      const result12h = getLocalizedShiftTime(18, 0, "12h");

      expect(result24h).toBe("18:00–24:00");
      expect(result12h).toBe("06:00 PM–12:00 AM");
    });

    it("should handle midnight (single end time = 0) correctly", () => {
      const result24h = getLocalizedShiftTime(null, 0, "24h");
      const result12h = getLocalizedShiftTime(null, 0, "12h");

      expect(result24h).toBe("24:00");
      expect(result12h).toBe("12:00 AM");
    });
  });

  describe("Sunday Week Number Tests (GitHub Issue #11)", () => {
    it("should handle Sunday week numbering correctly", () => {
      // Test case from GitHub issue #11
      const sunday = new Date("2025-05-18"); // Sunday
      const saturday = new Date("2025-05-17"); // Saturday (day before)

      const sundayCode = formatYYWWD(sunday);
      const saturdayCode = formatYYWWD(saturday);

      // Sunday should belong to the same ISO week as the preceding Saturday
      expect(sundayCode.slice(0, 4)).toBe(saturdayCode.slice(0, 4)); // Same YYWW
      expect(sundayCode).toMatch(/\.7$/); // Sunday should be day 7
      expect(saturdayCode).toMatch(/\.6$/); // Saturday should be day 6
    });

    it("should handle year-end Sunday correctly", () => {
      // Dec 31, 2023 was a Sunday
      const yearEndSunday = new Date("2023-12-31");
      const formatted = formatYYWWD(yearEndSunday);

      // Should be week 52 of 2023, day 7 (Sunday)
      expect(formatted).toBe("2352.7");
    });

    it("should maintain consistency across week boundaries", () => {
      // Test a full week to ensure consistency
      const monday = new Date("2025-05-12");
      const weekDays = [];

      for (let i = 0; i < 7; i++) {
        const day = dayjs(monday).add(i, "day");
        weekDays.push(formatYYWWD(day));
      }

      // All days should have the same YYWW prefix
      const weekPrefix = weekDays[0].slice(0, 4);
      weekDays.forEach((code) => {
        expect(code.slice(0, 4)).toBe(weekPrefix);
      });

      // Days should be numbered 1-7
      expect(weekDays).toEqual([
        `${weekPrefix}.1`, // Monday
        `${weekPrefix}.2`, // Tuesday
        `${weekPrefix}.3`, // Wednesday
        `${weekPrefix}.4`, // Thursday
        `${weekPrefix}.5`, // Friday
        `${weekPrefix}.6`, // Saturday
        `${weekPrefix}.7`, // Sunday
      ]);
    });
  });
});
