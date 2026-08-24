import { describe, it, expect } from "vitest";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "@/lib/timeOff/codecs";
import { dayjs } from "@/utils/dateTimeUtils";
import type { PublicHolidayInfo } from "@/types/publicHolidays";
import {
  getNonWorkingReason,
  hasTimeOffEvent,
  isPublicHolidayForShift,
  isWorkingDay,
} from "@/utils/workingDayUtils";

const dateEntry = (date: string) =>
  buildTimeOffEntryForRange({
    start: date,
    end: date,
    entryType: "vacation",
    entryFlag: "full_day",
  });

const rangeEntry = (start: string, end: string) =>
  buildTimeOffEntryForRange({
    start,
    end,
    entryType: "vacation",
    entryFlag: "full_day",
  });

const weeklyEntry = (weekday: number) =>
  createWeeklyTimeOffEntry({
    weekday,
    entryType: "in",
    entryFlag: "full_day",
  });

describe("workingDayUtils", () => {
  describe("hasTimeOffEvent", () => {
    it("matches dates inside range entries", () => {
      const entries = [rangeEntry("2026-01-15", "2026-01-20")];
      expect(hasTimeOffEvent(dayjs("2026-01-15"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-01-17"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-01-20"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-01-14"), entries)).toBe(false);
      expect(hasTimeOffEvent(dayjs("2026-01-21"), entries)).toBe(false);
    });

    it("matches weekly recurring entries by weekday", () => {
      const entries = [weeklyEntry(1)];
      expect(hasTimeOffEvent(dayjs("2026-01-26"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-02-02"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-01-27"), entries)).toBe(false);
    });

    it("handles mixed entry types", () => {
      const entries = [dateEntry("2026-01-15"), weeklyEntry(5)];
      expect(hasTimeOffEvent(dayjs("2026-01-15"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-01-30"), entries)).toBe(true);
      expect(hasTimeOffEvent(dayjs("2026-01-20"), entries)).toBe(false);
    });

    it("returns false for empty entries", () => {
      expect(hasTimeOffEvent(dayjs("2026-01-15"), [])).toBe(false);
    });
  });

  describe("isPublicHolidayForShift", () => {
    const createHolidayMap = (dates: string[]): Map<string, PublicHolidayInfo> => {
      const map = new Map<string, PublicHolidayInfo>();
      dates.forEach((date) => {
        map.set(date, { name: "Test Holiday", localName: "Test Holiday" });
      });
      return map;
    };

    it("returns false when teamNumber is null or holidays are empty", () => {
      expect(
        isPublicHolidayForShift(
          dayjs("2026-05-01"),
          null,
          "5-shift",
          createHolidayMap(["2026/05/01"]),
        ),
      ).toBe(false);
      expect(isPublicHolidayForShift(dayjs("2026-05-01"), 1, "5-shift", new Map())).toBe(false);
    });

    it("checks same day for non-night shifts", () => {
      expect(
        isPublicHolidayForShift(
          dayjs("2025-07-16"),
          1,
          "5-shift",
          createHolidayMap(["2025/07/16"]),
        ),
      ).toBe(true);
      expect(
        isPublicHolidayForShift(
          dayjs("2025-07-16"),
          1,
          "5-shift",
          createHolidayMap(["2025/07/17"]),
        ),
      ).toBe(false);
    });

    it("checks next day for night shifts", () => {
      expect(
        isPublicHolidayForShift(
          dayjs("2025-07-20"),
          1,
          "5-shift",
          createHolidayMap(["2025/07/21"]),
        ),
      ).toBe(true);
      expect(
        isPublicHolidayForShift(
          dayjs("2025-07-20"),
          1,
          "5-shift",
          createHolidayMap(["2025/07/20"]),
        ),
      ).toBe(false);
    });
  });

  describe("isWorkingDay", () => {
    const emptyHolidays = new Map<string, PublicHolidayInfo>();
    const emptyEntries = [] as ReturnType<typeof dateEntry>[];

    it("returns false when no team is selected", () => {
      expect(isWorkingDay(dayjs("2026-01-26"), null, "5-shift", emptyEntries, emptyHolidays)).toBe(
        false,
      );
    });

    it("respects shift schedule, entries, and holidays", () => {
      expect(isWorkingDay(dayjs("2025-07-22"), 1, "5-shift", emptyEntries, emptyHolidays)).toBe(
        false,
      );
      expect(isWorkingDay(dayjs("2025-07-16"), 1, "5-shift", emptyEntries, emptyHolidays)).toBe(
        true,
      );
      expect(
        isWorkingDay(dayjs("2025-07-16"), 1, "5-shift", [dateEntry("2025-07-16")], emptyHolidays),
      ).toBe(false);

      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/16", { name: "Test Holiday", localName: "Test Holiday" });
      expect(isWorkingDay(dayjs("2025-07-16"), 1, "5-shift", emptyEntries, holidays)).toBe(false);
    });

    it("handles 9-5 schedules", () => {
      expect(isWorkingDay(dayjs("2026-01-26"), 1, "9-5", emptyEntries, emptyHolidays)).toBe(true);
      expect(isWorkingDay(dayjs("2026-01-25"), 1, "9-5", emptyEntries, emptyHolidays)).toBe(false);
      expect(isWorkingDay(dayjs("2026-01-24"), 1, "9-5", emptyEntries, emptyHolidays)).toBe(false);
    });
  });

  describe("getNonWorkingReason", () => {
    const emptyHolidays = new Map<string, PublicHolidayInfo>();
    const emptyEntries = [] as ReturnType<typeof dateEntry>[];

    it("returns the expected precedence across non-working reasons", () => {
      expect(
        getNonWorkingReason(dayjs("2026-01-26"), null, "5-shift", emptyEntries, emptyHolidays),
      ).toBe("No team selected");
      expect(
        getNonWorkingReason(dayjs("2025-07-22"), 1, "5-shift", emptyEntries, emptyHolidays),
      ).toBe("Scheduled off day");
      expect(
        getNonWorkingReason(
          dayjs("2025-07-16"),
          1,
          "5-shift",
          [dateEntry("2025-07-16")],
          emptyHolidays,
        ),
      ).toBe("Time off");

      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/16", { name: "National Day", localName: "National Day" });
      expect(getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", emptyEntries, holidays)).toBe(
        "Public holiday: National Day",
      );
      expect(
        getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", [dateEntry("2025-07-16")], holidays),
      ).toBe("Time off");
      expect(
        getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", emptyEntries, emptyHolidays),
      ).toBeNull();
    });

    it("uses the next day holiday name for night shifts", () => {
      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/21", { name: "Liberation Day", localName: "Liberation Day" });
      expect(getNonWorkingReason(dayjs("2025-07-20"), 1, "5-shift", emptyEntries, holidays)).toBe(
        "Public holiday: Liberation Day",
      );
    });
  });
});
