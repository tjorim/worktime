import { describe, it, expect } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { HdayEvent } from "../../src/lib/hday/types";
import type { PublicHolidayInfo } from "../../src/types/publicHolidays";
import {
  hasTimeOffEvent,
  isPublicHolidayForShift,
  isWorkingDay,
  getNonWorkingReason,
} from "../../src/utils/workingDayUtils";

describe("workingDayUtils", () => {
  describe("hasTimeOffEvent", () => {
    describe("range events", () => {
      it("returns true when date falls within a range event", () => {
        const events: HdayEvent[] = [
          {
            type: "range",
            start: "2026/01/15",
            end: "2026/01/20",
            raw: "2026/01/15-2026/01/20",
          },
        ];

        expect(hasTimeOffEvent(dayjs("2026-01-15"), events)).toBe(true);
        expect(hasTimeOffEvent(dayjs("2026-01-17"), events)).toBe(true);
        expect(hasTimeOffEvent(dayjs("2026-01-20"), events)).toBe(true);
      });

      it("returns false when date is outside a range event", () => {
        const events: HdayEvent[] = [
          {
            type: "range",
            start: "2026/01/15",
            end: "2026/01/20",
            raw: "2026/01/15-2026/01/20",
          },
        ];

        expect(hasTimeOffEvent(dayjs("2026-01-14"), events)).toBe(false);
        expect(hasTimeOffEvent(dayjs("2026-01-21"), events)).toBe(false);
      });

      it("returns true for single-day range events", () => {
        const events: HdayEvent[] = [
          {
            type: "range",
            start: "2026/05/01",
            end: "2026/05/01",
            raw: "2026/05/01",
          },
        ];

        expect(hasTimeOffEvent(dayjs("2026-05-01"), events)).toBe(true);
        expect(hasTimeOffEvent(dayjs("2026-05-02"), events)).toBe(false);
      });

      it("handles multiple range events", () => {
        const events: HdayEvent[] = [
          {
            type: "range",
            start: "2026/01/10",
            end: "2026/01/12",
            raw: "2026/01/10-2026/01/12",
          },
          {
            type: "range",
            start: "2026/01/20",
            end: "2026/01/22",
            raw: "2026/01/20-2026/01/22",
          },
        ];

        expect(hasTimeOffEvent(dayjs("2026-01-11"), events)).toBe(true);
        expect(hasTimeOffEvent(dayjs("2026-01-21"), events)).toBe(true);
        expect(hasTimeOffEvent(dayjs("2026-01-15"), events)).toBe(false);
      });
    });

    describe("weekly recurring events", () => {
      it("returns true for matching weekday (Monday = 1)", () => {
        const events: HdayEvent[] = [
          {
            type: "weekly",
            weekday: 1, // Monday
            raw: "d1",
          },
        ];

        // 2026-01-26 is a Monday
        expect(hasTimeOffEvent(dayjs("2026-01-26"), events)).toBe(true);
        // 2026-02-02 is also a Monday
        expect(hasTimeOffEvent(dayjs("2026-02-02"), events)).toBe(true);
      });

      it("returns false for non-matching weekday", () => {
        const events: HdayEvent[] = [
          {
            type: "weekly",
            weekday: 1, // Monday
            raw: "d1",
          },
        ];

        // 2026-01-27 is a Tuesday
        expect(hasTimeOffEvent(dayjs("2026-01-27"), events)).toBe(false);
      });

      it("handles Sunday correctly (weekday 7 maps to dayjs day 0)", () => {
        const events: HdayEvent[] = [
          {
            type: "weekly",
            weekday: 7, // Sunday
            raw: "d7",
          },
        ];

        // 2026-01-25 is a Sunday
        expect(hasTimeOffEvent(dayjs("2026-01-25"), events)).toBe(true);
        // 2026-01-26 is a Monday
        expect(hasTimeOffEvent(dayjs("2026-01-26"), events)).toBe(false);
      });

      it("handles Friday correctly (weekday 5)", () => {
        const events: HdayEvent[] = [
          {
            type: "weekly",
            weekday: 5, // Friday
            raw: "d5",
          },
        ];

        // 2026-01-30 is a Friday
        expect(hasTimeOffEvent(dayjs("2026-01-30"), events)).toBe(true);
      });
    });

    it("returns false for empty events array", () => {
      expect(hasTimeOffEvent(dayjs("2026-01-15"), [])).toBe(false);
    });

    it("handles mixed event types", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2026/01/15",
          end: "2026/01/15",
          raw: "2026/01/15",
        },
        {
          type: "weekly",
          weekday: 5, // Friday
          raw: "d5",
        },
      ];

      // 2026-01-15 matches range event
      expect(hasTimeOffEvent(dayjs("2026-01-15"), events)).toBe(true);
      // 2026-01-30 is a Friday, matches weekly event
      expect(hasTimeOffEvent(dayjs("2026-01-30"), events)).toBe(true);
      // 2026-01-20 is a Tuesday, matches neither
      expect(hasTimeOffEvent(dayjs("2026-01-20"), events)).toBe(false);
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

    it("returns false when teamNumber is null", () => {
      const holidays = createHolidayMap(["2026/05/01"]);
      expect(isPublicHolidayForShift(dayjs("2026-05-01"), null, "5-shift", holidays)).toBe(false);
    });

    it("returns false when publicHolidays map is empty", () => {
      const emptyMap = new Map<string, PublicHolidayInfo>();
      expect(isPublicHolidayForShift(dayjs("2026-05-01"), 1, "5-shift", emptyMap)).toBe(false);
    });

    describe("day/morning/evening shifts check same day", () => {
      it("returns true when holiday is on the same day for morning shift", () => {
        // Team 1 on 2025-07-16 has Morning shift (reference date)
        const holidays = createHolidayMap(["2025/07/16"]);
        expect(isPublicHolidayForShift(dayjs("2025-07-16"), 1, "5-shift", holidays)).toBe(true);
      });

      it("returns false when holiday is on a different day for morning shift", () => {
        const holidays = createHolidayMap(["2025/07/17"]);
        expect(isPublicHolidayForShift(dayjs("2025-07-16"), 1, "5-shift", holidays)).toBe(false);
      });
    });

    describe("night shift checks NEXT day for holiday", () => {
      // For 5-shift schedule, we need to find a day when a team has night shift
      // Team 1 cycle: M M L L N N O O O O (days 1-10)
      // Reference date 2025-07-16 is day 1 for Team 1
      // So Team 1 has Night shift on days 5-6 of cycle
      // 2025-07-16 + 4 days = 2025-07-20 (Night shift for Team 1)

      it("returns true when NEXT day is a holiday for night shift", () => {
        // Team 1 on 2025-07-20 has Night shift
        // Night shift 23:00-07:00 means 7 of 8 hours fall on July 21
        // So if July 21 is a holiday, July 20 night shift is off
        const holidays = createHolidayMap(["2025/07/21"]);
        expect(isPublicHolidayForShift(dayjs("2025-07-20"), 1, "5-shift", holidays)).toBe(true);
      });

      it("returns false when SAME day is a holiday for night shift (next day is not)", () => {
        // If July 20 is a holiday but July 21 is not, night shift still works
        // because most hours (7 of 8) fall on July 21 which is not a holiday
        const holidays = createHolidayMap(["2025/07/20"]);
        expect(isPublicHolidayForShift(dayjs("2025-07-20"), 1, "5-shift", holidays)).toBe(false);
      });

      it("handles night shift holiday spanning midnight correctly", () => {
        // Real scenario: Liberation Day is May 5
        // Night shift starting May 4 at 23:00 runs until May 5 at 07:00
        // 7 hours fall on May 5, so this night shift should be off

        // Find a date when Team 2 has night shift near May 5, 2026
        // Team 2 on Jan 28-29, 2026 has Night shift (verified earlier)
        const holidays = createHolidayMap(["2026/01/29"]);
        expect(isPublicHolidayForShift(dayjs("2026-01-28"), 2, "5-shift", holidays)).toBe(true);
      });
    });

    describe("9-5 schedule", () => {
      it("returns true when holiday is on a weekday (working day)", () => {
        // 2026-01-01 is a Thursday
        const holidays = createHolidayMap(["2026/01/01"]);
        expect(isPublicHolidayForShift(dayjs("2026-01-01"), 1, "9-5", holidays)).toBe(true);
      });

      it("returns true when holiday is on a weekend (already off, but still a holiday)", () => {
        // 2026-01-03 is a Saturday
        const holidays = createHolidayMap(["2026/01/03"]);
        // For 9-5, Saturday is Off (O), but the function still checks if it's a holiday
        // The shift is O, so isPublicHolidayForShift checks same day
        expect(isPublicHolidayForShift(dayjs("2026-01-03"), 1, "9-5", holidays)).toBe(true);
      });
    });
  });

  describe("isWorkingDay", () => {
    const emptyHolidays = new Map<string, PublicHolidayInfo>();
    const emptyEvents: HdayEvent[] = [];

    it("returns false when teamNumber is null", () => {
      expect(isWorkingDay(dayjs("2026-01-26"), null, "5-shift", emptyEvents, emptyHolidays)).toBe(
        false,
      );
    });

    it("returns false when scheduled shift is OFF", () => {
      // Team 1 cycle: M M L L N N O O O O
      // Reference 2025-07-16 is day 1, so day 7 (2025-07-22) is Off
      expect(isWorkingDay(dayjs("2025-07-22"), 1, "5-shift", emptyEvents, emptyHolidays)).toBe(
        false,
      );
    });

    it("returns true when scheduled shift is working and no events/holidays", () => {
      // Team 1 on 2025-07-16 has Morning shift (working)
      expect(isWorkingDay(dayjs("2025-07-16"), 1, "5-shift", emptyEvents, emptyHolidays)).toBe(
        true,
      );
    });

    it("returns false when there is a time-off event", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/07/16",
          end: "2025/07/16",
          raw: "2025/07/16",
        },
      ];
      expect(isWorkingDay(dayjs("2025-07-16"), 1, "5-shift", events, emptyHolidays)).toBe(false);
    });

    it("returns false when there is a public holiday", () => {
      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/16", { date: "2025/07/16", name: "Test Holiday", country: "BE" });

      expect(isWorkingDay(dayjs("2025-07-16"), 1, "5-shift", emptyEvents, holidays)).toBe(false);
    });

    it("returns false for night shift when next day is a holiday", () => {
      // Team 1 on 2025-07-20 has Night shift
      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/21", { date: "2025/07/21", name: "Test Holiday", country: "BE" });

      expect(isWorkingDay(dayjs("2025-07-20"), 1, "5-shift", emptyEvents, holidays)).toBe(false);
    });

    describe("9-5 schedule", () => {
      it("returns true for weekdays without events", () => {
        // 2026-01-26 is a Monday
        expect(isWorkingDay(dayjs("2026-01-26"), 1, "9-5", emptyEvents, emptyHolidays)).toBe(true);
      });

      it("returns false for weekends", () => {
        // 2026-01-25 is a Sunday
        expect(isWorkingDay(dayjs("2026-01-25"), 1, "9-5", emptyEvents, emptyHolidays)).toBe(false);
        // 2026-01-24 is a Saturday
        expect(isWorkingDay(dayjs("2026-01-24"), 1, "9-5", emptyEvents, emptyHolidays)).toBe(false);
      });
    });
  });

  describe("getNonWorkingReason", () => {
    const emptyHolidays = new Map<string, PublicHolidayInfo>();
    const emptyEvents: HdayEvent[] = [];

    it("returns 'No team selected' when teamNumber is null", () => {
      expect(getNonWorkingReason(dayjs("2026-01-26"), null, "5-shift", emptyEvents, emptyHolidays)).toBe(
        "No team selected",
      );
    });

    it("returns 'Scheduled off day' when shift is OFF", () => {
      // Team 1 on 2025-07-22 has Off shift
      expect(
        getNonWorkingReason(dayjs("2025-07-22"), 1, "5-shift", emptyEvents, emptyHolidays),
      ).toBe("Scheduled off day");
    });

    it("returns 'Time off' when there is a time-off event", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/07/16",
          end: "2025/07/16",
          raw: "2025/07/16",
        },
      ];
      expect(getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", events, emptyHolidays)).toBe(
        "Time off",
      );
    });

    it("returns public holiday name when there is a holiday", () => {
      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/16", { date: "2025/07/16", name: "National Day", country: "BE" });

      expect(getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", emptyEvents, holidays)).toBe(
        "Public holiday: National Day",
      );
    });

    it("returns correct holiday name for night shift (checks next day)", () => {
      // Team 1 on 2025-07-20 has Night shift, holiday on 2025-07-21
      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/21", { date: "2025/07/21", name: "Liberation Day", country: "BE" });

      expect(getNonWorkingReason(dayjs("2025-07-20"), 1, "5-shift", emptyEvents, holidays)).toBe(
        "Public holiday: Liberation Day",
      );
    });

    it("returns null for a working day", () => {
      expect(
        getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", emptyEvents, emptyHolidays),
      ).toBeNull();
    });

    it("prioritizes scheduled off day over time-off events", () => {
      // Even if there's a time-off event on an off day, reason should be "Scheduled off day"
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/07/22",
          end: "2025/07/22",
          raw: "2025/07/22",
        },
      ];
      expect(getNonWorkingReason(dayjs("2025-07-22"), 1, "5-shift", events, emptyHolidays)).toBe(
        "Scheduled off day",
      );
    });

    it("prioritizes time-off over public holidays", () => {
      // If both time-off and holiday exist on same day, time-off takes priority
      const events: HdayEvent[] = [
        {
          type: "range",
          start: "2025/07/16",
          end: "2025/07/16",
          raw: "2025/07/16",
        },
      ];
      const holidays = new Map<string, PublicHolidayInfo>();
      holidays.set("2025/07/16", { date: "2025/07/16", name: "National Day", country: "BE" });

      expect(getNonWorkingReason(dayjs("2025-07-16"), 1, "5-shift", events, holidays)).toBe(
        "Time off",
      );
    });
  });
});
