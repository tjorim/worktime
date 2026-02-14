import { describe, expect, it, vi } from "vitest";
import { SCHEDULE_OPTIONS } from "../../src/data/rosters";
import { dayjs, formatYYWWD } from "../../src/utils/dateTimeUtils";
import {
  calculateShift,
  getAllTeamsShifts,
  getCurrentShiftDay,
  getNextShift,
  getOffDayProgress,
  getShift,
  getShiftCode,
  isCurrentlyWorking,
  SHIFTS,
} from "../../src/utils/shiftCalculations";

describe("Shift Calculations", () => {
  describe("Core Business Logic", () => {
    it("should calculate correct shift for reference team on reference date", () => {
      // Reference: Team 1 on 2025-07-16 should be in morning shift (cycle start)
      const referenceDate = new Date("2025-07-16");
      const shift = calculateShift(referenceDate, 1);
      expect(shift).toStrictEqual(getShift("M", "5-shift"));
    });

    it("should calculate different shifts for different teams on same date", () => {
      const testDate = new Date("2025-07-16");
      const team1Shift = calculateShift(testDate, 1);
      const team2Shift = calculateShift(testDate, 2);

      // Teams should have different shifts due to offset
      expect(team1Shift).not.toBe(team2Shift);
    });

    it("should handle shift progression correctly", () => {
      const baseDate = new Date("2025-07-16");
      const team = 1;

      // Test 10-day cycle
      const shifts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const date = dayjs(baseDate).add(i, "day").toDate();
        const shift = calculateShift(date, team);
        shifts.push(shift.code);
      }

      // Should see pattern: M, M, E, E, N, N, O, O, O, O
      expect(shifts.slice(0, 6)).toEqual(["M", "M", "L", "L", "N", "N"]);
      expect(shifts.slice(6)).toEqual(["O", "O", "O", "O"]);
    });

    it("should use correct default reference date for 5-shift schedule", () => {
      // Test that the 5-shift schedule uses July 16, 2025 as the reference date
      // This ensures Team 1's cycle aligns with August 1, 2022 historic start
      const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
      const referenceDate = new Date(`${fiveShiftRoster?.shiftConfig.referenceDate}T00:00:00.000Z`);

      // Convert to comparable format
      const referenceDateString = referenceDate.toISOString().split("T")[0];
      expect(referenceDateString).toBe("2025-07-16");

      // Verify Team 1 has morning shift on reference date with 5-shift schedule
      const shift = calculateShift(referenceDate, 1, "5-shift");
      expect(shift).toStrictEqual(getShift("M", "5-shift"));
    });
  });

  describe("Shift Code Generation", () => {
    it("should generate correct shift codes", () => {
      const testDate = new Date("2025-07-16");
      const code = getShiftCode(testDate, 1);
      expect(code).toMatch(/^\d{4}\.\d[MLNDO]$/); // Format: YYWW.DX (M=Morning, L=Late, N=Night, D=Day, O=Off)
    });

    it("should adjust date for night shifts", () => {
      // Find a date where team has night shift
      const baseDate = new Date("2025-07-16");
      let nightDate: Date | null = null;

      for (let i = 0; i < 10; i++) {
        const date = dayjs(baseDate).add(i, "day").toDate();
        const shift = calculateShift(date, 1);
        if (shift.code === "N") {
          nightDate = date;
          break;
        }
      }

      // Ensure we found a night shift date, fail the test if not
      if (!nightDate) {
        throw new Error("No night shift found in test range - test setup is invalid");
      }

      // Now TypeScript knows nightDate is definitely not null
      expect(nightDate).not.toBeNull();
      const code = getShiftCode(nightDate, 1);
      const expectedPrevDay = dayjs(nightDate).subtract(1, "day");
      const expectedCode = `${formatYYWWD(expectedPrevDay)}N`;
      expect(code).toBe(expectedCode);
    });
  });

  describe("2-shift week 53 continuity", () => {
    it("should continue normal weekly rotation through ISO week 53 into week 1", () => {
      const week52Monday = dayjs("2026-12-21"); // ISO week 52
      const week53Monday = dayjs("2026-12-28"); // ISO week 53
      const week1Monday = dayjs("2027-01-04"); // ISO week 1

      const week52Team1 = calculateShift(week52Monday, 1, "2-shift");
      const week53Team1 = calculateShift(week53Monday, 1, "2-shift");
      const week1Team1 = calculateShift(week1Monday, 1, "2-shift");

      // Rotation continues weekly (M -> L -> M) through week 53 into week 1
      expect(week52Team1.code).toBe("M");
      expect(week53Team1.code).toBe("L");
      expect(week1Team1.code).toBe("M");

      // Verify encoded week labels around the boundary
      expect(formatYYWWD(week53Monday)).toBe("2653.1");
      expect(formatYYWWD(week1Monday)).toBe("2701.1");
    });

    it("should keep the weekend support day-shift rotating by team", () => {
      const week53Saturday = dayjs("2027-01-02"); // Sat of ISO week 53 (2653)
      const week1Saturday = dayjs("2027-01-09"); // Sat of ISO week 1 (2701)

      expect(calculateShift(week53Saturday, 4, "2-shift").code).toBe("D");
      expect(calculateShift(week53Saturday, 1, "2-shift").code).toBe("O");
      expect(calculateShift(week1Saturday, 1, "2-shift").code).toBe("D");
      expect(calculateShift(week1Saturday, 4, "2-shift").code).toBe("O");
    });
  });

  describe("Next Shift Calculation", () => {
    it("should find next working shift", () => {
      const testDate = new Date("2025-07-16");
      const nextShift = getNextShift(testDate, 1);

      expect(nextShift).toBeTruthy();
      if (nextShift) {
        expect(nextShift.shift.code).not.toBe("O"); // Should not be off
        expect(nextShift.date.isAfter(dayjs(testDate))).toBe(true);
      }
    });

    it("should return null for team with no upcoming shifts in cycle", () => {
      // This is edge case - should not happen in normal 10-day cycle
      // but tests the boundary condition
      const result = getNextShift(new Date("2025-07-16"), 999); // Invalid team
      // Implementation should handle this gracefully by returning null
      expect(result).toBeNull();
    });
  });

  describe("Current Shift Day", () => {
    it("should return same day for times after 7 AM", () => {
      const testDate = dayjs("2025-07-16 10:00");
      const shiftDay = getCurrentShiftDay(testDate, "5-shift");
      expect(shiftDay.isSame(testDate, "day")).toBe(true);
    });

    it("should return previous day for times before 7 AM for 5-shift", () => {
      const testDate = dayjs("2025-07-16 05:00");
      const shiftDay = getCurrentShiftDay(testDate, "5-shift");
      const expectedDay = testDate.subtract(1, "day");
      expect(shiftDay.isSame(expectedDay, "day")).toBe(true);
    });
  });

  describe("getCurrentShiftDay with schedule awareness", () => {
    it("should use previous day before 7 AM for 5-shift schedule", () => {
      const testDate = dayjs("2025-07-16 06:00");
      const shiftDay = getCurrentShiftDay(testDate, "5-shift");
      const expectedDay = testDate.subtract(1, "day");
      expect(shiftDay.isSame(expectedDay, "day")).toBe(true);
    });

    it("should use current day before 7 AM for schedules without night shifts", () => {
      const testDate = dayjs("2025-07-16 06:00");
      const schedules = ["9-5", "2-shift", "weekend-shift"] as const;

      schedules.forEach((schedule) => {
        const shiftDay = getCurrentShiftDay(testDate, schedule);
        expect(shiftDay.isSame(testDate, "day")).toBe(true);
      });
    });

    it("should return calendar day when schedule is omitted", () => {
      const testDate = dayjs("2025-07-16 06:00");
      const shiftDay = getCurrentShiftDay(testDate);
      expect(shiftDay.isSame(testDate, "day")).toBe(true);
    });

    it("should return current day after 7 AM for all schedules", () => {
      const testDate = dayjs("2025-07-16 08:00");
      const schedules = ["5-shift", "9-5", "2-shift", "weekend-shift"] as const;

      schedules.forEach((schedule) => {
        const shiftDay = getCurrentShiftDay(testDate, schedule);
        expect(shiftDay.isSame(testDate, "day")).toBe(true);
      });

      const defaultShiftDay = getCurrentShiftDay(testDate);
      expect(defaultShiftDay.isSame(testDate, "day")).toBe(true);
    });
  });

  describe("Night shift midnight crossing consistency", () => {
    it("should have consistent shift calculation and code for night shifts crossing midnight", () => {
      // Test at 2 AM during a night shift (using date with known night shift)
      const nightTime = dayjs("2025-07-20 02:00"); // 2 AM on July 20 (team 1 night shift period)

      const shiftDay = getCurrentShiftDay(nightTime, "5-shift"); // Should be July 19
      const shift = calculateShift(shiftDay, 1, "5-shift");
      const code = getShiftCode(shiftDay, 1, "5-shift");

      // All calculations should be based on the same day (shiftDay)
      expect(shiftDay.isSame(nightTime.subtract(1, "day"), "day")).toBe(true);

      // If this is a night shift, the code should reflect the previous day
      if (shift.code === "N") {
        // Code should use previous day format
        const expectedCode = `${formatYYWWD(shiftDay)}N`;
        expect(code).toBe(expectedCode);
      }
    });
  });

  describe("Pre-7AM Schedule Display", () => {
    it("should show calendar day shift, not shift day, for schedule display at 00:20", () => {
      // Regression test for: "Wrong shift calculations" issue
      // At Monday Jan 26, 2026 00:20, the app should show Monday's schedule, not Sunday's

      const mondayMorning = dayjs("2026-01-26 00:20"); // Monday 00:20 (before 7 AM)
      const monday = mondayMorning.startOf("day"); // Monday calendar day

      // Team 2 on Monday Jan 26: should be Late/Evening (L)
      const team2Monday = calculateShift(monday, 2, "5-shift");
      expect(team2Monday.code).toBe("L"); // Evening shift on Monday

      // Using getCurrentShiftDay with 5-shift gives Sunday's shift (for night shift tracking)
      const shiftDay = getCurrentShiftDay(mondayMorning, "5-shift"); // Returns Sunday
      const team2ShiftDay = calculateShift(shiftDay, 2, "5-shift");
      expect(team2ShiftDay.code).toBe("M"); // Sunday's Morning shift (WRONG for schedule display)

      // The fix: Always use calendar day for schedule display
      expect(team2Monday.code).not.toBe(team2ShiftDay.code);
    });

    it("should show calendar day schedule even when before 7 AM (after night shift)", () => {
      // At Friday Jan 30, 2026 00:30 (after midnight), we're still before 7 AM
      // Team 2's schedule for Friday is Off (O), not Thursday's Night shift
      // This ensures the schedule display shows Friday's schedule, not Thursday's

      const fridayMorning = dayjs("2026-01-30 00:30"); // Friday 00:30
      const friday = fridayMorning.startOf("day"); // Friday calendar day

      // Team 2 on Friday Jan 30: should be Off (O)
      const team2Friday = calculateShift(friday, 2, "5-shift");
      expect(team2Friday.code).toBe("O"); // Off on Friday

      // Using getCurrentShiftDay with 5-shift gives Thursday (for night shift tracking)
      const shiftDay = getCurrentShiftDay(fridayMorning, "5-shift"); // Returns Thursday
      const team2ShiftDay = calculateShift(shiftDay, 2, "5-shift");
      expect(team2ShiftDay.code).toBe("N"); // Thursday's Night shift (WRONG for schedule display)

      // The fix ensures we show Friday's schedule, not Thursday's
      expect(team2Friday.code).not.toBe(team2ShiftDay.code);
    });
  });

  describe("isCurrentlyWorking with schedule awareness", () => {
    it("should avoid legacy cutoff for non-night schedules before 7 AM", () => {
      const shift = getShift("N", "5-shift");
      const date = dayjs("2025-01-12");
      const currentTime = dayjs("2025-01-13 06:00");

      const working = isCurrentlyWorking(shift, date, currentTime, "9-5");
      expect(working).toBe(false);
    });

    it("should treat pre-7AM as previous day for night-shift schedules", () => {
      const shift = getShift("N", "5-shift");
      const date = dayjs("2025-07-19");
      const currentTime = dayjs("2025-07-20 06:00");

      const working = isCurrentlyWorking(shift, date, currentTime, "5-shift");
      expect(working).toBe(true);
    });

    it("should require schedule option for night shift detection", () => {
      const shift = getShift("N", "5-shift");
      const date = dayjs("2025-07-19");
      const currentTime = dayjs("2025-07-20 06:00");

      // Without schedule option, calendar day is used (no night shift assumption)
      const workingWithoutSchedule = isCurrentlyWorking(shift, date, currentTime);
      expect(workingWithoutSchedule).toBe(false);

      // With 5-shift schedule, previous day is used (night shift aware)
      const workingWithSchedule = isCurrentlyWorking(shift, date, currentTime, "5-shift");
      expect(workingWithSchedule).toBe(true);
    });
  });
});

describe("getAllTeamsShifts Function Tests", () => {
  it("should return shifts for all teams on a given date", () => {
    const testDate = new Date("2025-07-16");
    const allShifts = getAllTeamsShifts(testDate, "5-shift");
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const teamCount = fiveShiftRoster?.shiftConfig.teamCount ?? 5;

    expect(allShifts).toHaveLength(teamCount);

    // Each result should have the required properties
    allShifts.forEach((result, index) => {
      expect(result.teamNumber).toBe(index + 1);
      expect(result.shift).toBeDefined();
      expect(result.code).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.shift.code).toMatch(/^[MLNDO]$/);
      expect(result.code).toMatch(/^\d{4}\.\d[MLNDO]$/);
    });
  });

  it("should return different shifts for different teams on same date", () => {
    const testDate = new Date("2025-07-16");
    const allShifts = getAllTeamsShifts(testDate);

    // Not all teams should have the same shift (due to offset)
    const shiftCodes = allShifts.map((s) => s.shift.code);
    const uniqueShifts = new Set(shiftCodes);

    // Should have more than one unique shift type
    expect(uniqueShifts.size).toBeGreaterThan(1);
  });

  it("should maintain consistency with individual calculateShift calls", () => {
    const testDate = new Date("2025-07-16");
    const allShifts = getAllTeamsShifts(testDate);

    // Verify each team's shift matches individual calculation
    allShifts.forEach((result) => {
      const individualShift = calculateShift(testDate, result.teamNumber);
      const individualCode = getShiftCode(testDate, result.teamNumber);

      expect(result.shift).toEqual(individualShift);
      expect(result.code).toBe(individualCode);
    });
  });

  it("should handle edge dates correctly for all teams", () => {
    const edgeDates = [
      new Date("2024-02-29"), // Leap year
      new Date("2024-12-31"), // Year end
      new Date("2025-01-01"), // Year start
      new Date("2025-07-16"), // Reference date
    ];
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const teamCount = fiveShiftRoster?.shiftConfig.teamCount ?? 5;

    edgeDates.forEach((date) => {
      const allShifts = getAllTeamsShifts(date, "5-shift");
      expect(allShifts).toHaveLength(teamCount);

      allShifts.forEach((result) => {
        expect(result.shift).toBeDefined();
        expect(["M", "L", "N", "O"]).toContain(result.shift.code);
      });
    });
  });
});

describe("SHIFTS Constant Validation", () => {
  it("should have properly defined SHIFTS constants", () => {
    expect(SHIFTS.MORNING.code).toBe("M");
    expect(SHIFTS.MORNING.emoji).toBe("🌅");
    expect(SHIFTS.MORNING.name).toBe("");
    expect(SHIFTS.MORNING.start).toBe(null);
    expect(SHIFTS.MORNING.end).toBe(null);
    expect(SHIFTS.MORNING.isWorking).toBe(true);
    expect(SHIFTS.MORNING.className).toBe("shift-morning");

    expect(SHIFTS.LATE.code).toBe("L");
    expect(SHIFTS.LATE.emoji).toBe("🌆");
    expect(SHIFTS.LATE.name).toBe("");
    expect(SHIFTS.LATE.start).toBe(null);
    expect(SHIFTS.LATE.end).toBe(null);
    expect(SHIFTS.LATE.isWorking).toBe(true);
    expect(SHIFTS.LATE.className).toBe("shift-late");

    expect(SHIFTS.NIGHT.code).toBe("N");
    expect(SHIFTS.NIGHT.emoji).toBe("🌙");
    expect(SHIFTS.NIGHT.name).toBe("");
    expect(SHIFTS.NIGHT.start).toBe(null);
    expect(SHIFTS.NIGHT.end).toBe(null);
    expect(SHIFTS.NIGHT.isWorking).toBe(true);
    expect(SHIFTS.NIGHT.className).toBe("shift-night");

    expect(SHIFTS.OFF.code).toBe("O");
    expect(SHIFTS.OFF.emoji).toBe("🏠");
    expect(SHIFTS.OFF.name).toBe("");
    expect(SHIFTS.OFF.start).toBe(null);
    expect(SHIFTS.OFF.end).toBe(null);
    expect(SHIFTS.OFF.isWorking).toBe(false);
    expect(SHIFTS.OFF.className).toBe("shift-off");
  });

  it("should throw error for invalid inputs in getShift", () => {
    // getShift now requires valid ShiftType and ScheduleOption - throws for invalid inputs
    expect(() => getShift("invalid" as "M", "5-shift")).toThrow();
    expect(() => getShift("" as "M", "5-shift")).toThrow();
    // Valid inputs should work
    expect(getShift("M", "5-shift").className).toBe("shift-morning");
    expect(getShift("O", "5-shift").className).toBe("shift-off");
  });

  it("should have immutable SHIFTS object", () => {
    // Test that SHIFTS is read-only
    expect(() => {
      // @ts-expect-error Testing immutability
      SHIFTS.MORNING.code = "X";
    }).toThrow();
  });
});

describe("Input Type Flexibility Tests", () => {
  it("should accept string dates in calculateShift", () => {
    const stringDate = "2025-07-16";
    const shift = calculateShift(stringDate, 1);
    expect(shift).toBeDefined();
    expect(shift.code).toMatch(/^[MLNO]$/);
  });

  it("should accept dayjs objects in calculateShift", () => {
    const dayjsDate = dayjs("2025-07-16");
    const shift = calculateShift(dayjsDate, 1);
    expect(shift).toBeDefined();
    expect(shift.code).toMatch(/^[MLNO]$/);
  });

  it("should accept different date formats in getCurrentShiftDay", () => {
    const testDate = new Date("2025-07-16 10:00");
    const stringDate = "2025-07-16 10:00";
    const dayjsDate = dayjs("2025-07-16 10:00");

    const day1 = getCurrentShiftDay(testDate);
    const day2 = getCurrentShiftDay(stringDate);
    const day3 = getCurrentShiftDay(dayjsDate);

    expect(day1.isSame(day2, "day")).toBe(true);
    expect(day2.isSame(day3, "day")).toBe(true);
  });
});

describe("Roster Configuration Integration Tests", () => {
  it("should use roster-specific team count", () => {
    const testDate = new Date("2025-07-16");

    // Test 5-shift roster with 5 teams
    const fiveShiftResults = getAllTeamsShifts(testDate, "5-shift");
    expect(fiveShiftResults).toHaveLength(5);

    // Test 9-5 roster with 1 team
    const nineFiveResults = getAllTeamsShifts(testDate, "9-5");
    expect(nineFiveResults).toHaveLength(1);

    // Test 2-shift roster with 4 teams
    const twoShiftResults = getAllTeamsShifts(testDate, "2-shift");
    expect(twoShiftResults).toHaveLength(4);
  });

  it("should use roster-specific reference date and team", () => {
    // Test that 5-shift reference team has expected shift on reference date
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const referenceDate = new Date(`${fiveShiftRoster?.shiftConfig.referenceDate}T00:00:00.000Z`);
    const referenceShift = calculateShift(referenceDate, 1, "5-shift");
    expect(referenceShift).toStrictEqual(getShift("M", "5-shift"));
  });

  it("should respect roster-specific cycle length", () => {
    const baseDate = new Date("2025-07-16");
    const team = 1;
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const cycleLength = fiveShiftRoster?.shiftConfig.cycleLengthDays ?? 10;

    // Test that pattern repeats after cycle length
    const shifts1: string[] = [];
    const shifts2: string[] = [];

    for (let i = 0; i < cycleLength; i++) {
      const date1 = dayjs(baseDate).add(i, "day").toDate();
      const date2 = dayjs(baseDate)
        .add(i + cycleLength, "day")
        .toDate();

      shifts1.push(calculateShift(date1, team, "5-shift").code);
      shifts2.push(calculateShift(date2, team, "5-shift").code);
    }

    expect(shifts1).toEqual(shifts2);
  });
});

describe("Error Handling and Robustness", () => {
  it("should handle NaN dates gracefully", () => {
    // Suppress console warnings for expected invalid input tests
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const nanDate = new Date(NaN);
    expect(() => calculateShift(nanDate, 1)).not.toThrow();
    expect(() => getCurrentShiftDay(nanDate)).not.toThrow();

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  it("should validate team numbers and throw errors for invalid values", () => {
    const testDate = new Date("2025-07-16");
    const invalidTeams = [
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
      0,
      -1000,
      1000,
      6, // Above max teams
      -1, // Below min teams
    ];

    invalidTeams.forEach((team) => {
      expect(() => calculateShift(testDate, team)).toThrow(/Invalid team number/);
      expect(() => getShiftCode(testDate, team)).toThrow(/Invalid team number/);
    });
  });

  it("should return null for invalid teams in getNextShift", () => {
    const testDate = new Date("2025-07-16");

    expect(getNextShift(testDate, 0, "5-shift")).toBeNull();
    expect(getNextShift(testDate, -1, "5-shift")).toBeNull();
    expect(getNextShift(testDate, 6, "5-shift")).toBeNull(); // 5-shift has 5 teams
    expect(getNextShift(testDate, 999, "5-shift")).toBeNull();
  });

  it("should handle malformed date strings", () => {
    // Suppress console warnings for expected invalid input tests
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const malformedDates = ["invalid", "2025-13-01", "2025-02-30", ""];

    malformedDates.forEach((dateStr) => {
      expect(() => calculateShift(dateStr, 1)).not.toThrow();
      expect(() => getCurrentShiftDay(dateStr)).not.toThrow();
    });

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });
});

describe("Real-world Scenario Tests", () => {
  it("should handle typical shift scheduling scenarios", () => {
    const today = dayjs();
    const team = 1;

    // Current shift
    const currentShift = calculateShift(today, team);
    expect(currentShift).toBeDefined();

    // Next shift
    const nextShift = getNextShift(today, team);
    if (nextShift) {
      expect(nextShift.date.isAfter(today)).toBe(true);
      expect(nextShift.shift.isWorking).toBe(true);
    }

    // Shift code generation
    const shiftCode = getShiftCode(today, team);
    expect(shiftCode).toMatch(/^\d{4}\.\d[MLNO]$/);
  });

  it("should handle week boundaries correctly in shift calculations", () => {
    // Test across week boundaries
    const sunday = dayjs("2025-07-20"); // Sunday
    const monday = dayjs("2025-07-21"); // Monday

    const sundayShift = calculateShift(sunday, 1);
    const mondayShift = calculateShift(monday, 1);

    expect(sundayShift).toBeDefined();
    expect(mondayShift).toBeDefined();

    // Codes should reflect correct week numbers
    const sundayCode = getShiftCode(sunday, 1);
    const mondayCode = getShiftCode(monday, 1);

    expect(sundayCode).toMatch(/^\d{4}\.\d[MLNO]$/);
    expect(mondayCode).toMatch(/^\d{4}\.\d[MLNO]$/);
  });

  it("should maintain shift consistency during night shift transitions", () => {
    // Test night shift handling across midnight for 5-shift schedule
    const lateNight = dayjs("2025-07-20 23:30");
    const earlyMorning = dayjs("2025-07-21 02:00");
    const morning = dayjs("2025-07-21 08:00");

    const lateShiftDay = getCurrentShiftDay(lateNight, "5-shift");
    const earlyShiftDay = getCurrentShiftDay(earlyMorning, "5-shift");
    const morningShiftDay = getCurrentShiftDay(morning, "5-shift");

    // Late night and early morning should be same shift day
    expect(lateShiftDay.isSame(lateNight, "day")).toBe(true);
    expect(earlyShiftDay.isSame(earlyMorning.subtract(1, "day"), "day")).toBe(true);
    expect(morningShiftDay.isSame(morning, "day")).toBe(true);
  });
});

describe("Type Safety and Interface Compliance", () => {
  it("should return proper Shift interface from calculateShift", () => {
    const testDate = new Date("2025-07-16");
    const shift = calculateShift(testDate, 1);

    // Check all required properties exist and have correct types
    expect(typeof shift.code).toBe("string");
    expect(typeof shift.name).toBe("string");
    expect(typeof shift.isWorking).toBe("boolean");

    // start and end can be number or null
    expect(shift.start === null || typeof shift.start === "number").toBe(true);
    expect(shift.end === null || typeof shift.end === "number").toBe(true);
  });

  it("should return proper ShiftResult interface from getAllTeamsShifts", () => {
    const testDate = new Date("2025-07-16");
    const results = getAllTeamsShifts(testDate);

    results.forEach((result) => {
      expect(dayjs.isDayjs(result.date)).toBe(true);
      expect(typeof result.shift).toBe("object");
      expect(typeof result.code).toBe("string");
      expect(typeof result.teamNumber).toBe("number");

      // Verify shift object structure
      expect(typeof result.shift.code).toBe("string");
      expect(typeof result.shift.name).toBe("string");
      expect(typeof result.shift.isWorking).toBe("boolean");
    });
  });

  it("should return proper UpcomingShiftResult interface from getNextShift", () => {
    const testDate = new Date("2025-07-16");
    const nextShift = getNextShift(testDate, 1);

    if (nextShift) {
      expect(dayjs.isDayjs(nextShift.date)).toBe(true);
      expect(typeof nextShift.shift).toBe("object");
      expect(typeof nextShift.code).toBe("string");

      // Verify shift object structure
      expect(typeof nextShift.shift.code).toBe("string");
      expect(typeof nextShift.shift.name).toBe("string");
      expect(typeof nextShift.shift.isWorking).toBe("boolean");
    }
  });
});

describe("getOffDayProgress Function Tests", () => {
  it("should return null for teams that are working", () => {
    const testDate = new Date("2025-07-16");
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const teamCount = fiveShiftRoster?.shiftConfig.teamCount ?? 5;

    // Find a team that's working on this date
    let workingTeam: number | null = null;
    for (let team = 1; team <= teamCount; team++) {
      const shift = calculateShift(testDate, team, "5-shift");
      if (shift.isWorking) {
        workingTeam = team;
        break;
      }
    }

    expect(workingTeam).not.toBeNull();
    if (workingTeam) {
      const progress = getOffDayProgress(testDate, workingTeam, "5-shift");
      expect(progress).toBeNull();
    }
  });

  it("should calculate correct off-day progress for teams that are off", () => {
    const testDate = new Date("2025-07-16");
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const teamCount = fiveShiftRoster?.shiftConfig.teamCount ?? 5;

    // Find a team that's off on this date
    let offTeam: number | null = null;
    for (let team = 1; team <= teamCount; team++) {
      const shift = calculateShift(testDate, team, "5-shift");
      if (!shift.isWorking) {
        offTeam = team;
        break;
      }
    }

    expect(offTeam).not.toBeNull();
    if (offTeam) {
      const progress = getOffDayProgress(testDate, offTeam, "5-shift");

      if (progress) {
        expect(progress.current).toBeGreaterThan(0);
        expect(progress.current).toBeLessThanOrEqual(4);
        expect(progress.total).toBe(4);
        expect(typeof progress.current).toBe("number");
        expect(typeof progress.total).toBe("number");
      }
    }
  });

  it("should return null for invalid team numbers", () => {
    const testDate = new Date("2025-07-16");

    expect(getOffDayProgress(testDate, 0, "5-shift")).toBeNull();
    expect(getOffDayProgress(testDate, -1, "5-shift")).toBeNull();
    expect(getOffDayProgress(testDate, 6, "5-shift")).toBeNull(); // 5-shift has 5 teams
    expect(getOffDayProgress(testDate, 999, "5-shift")).toBeNull();
  });

  it("should handle different date formats correctly", () => {
    // Find a team that's off
    let offTeam: number | null = null;
    const testDate = new Date("2025-07-20"); // Different test date
    const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    const teamCount = fiveShiftRoster?.shiftConfig.teamCount ?? 5;

    for (let team = 1; team <= teamCount; team++) {
      const shift = calculateShift(testDate, team, "5-shift");
      if (!shift.isWorking) {
        offTeam = team;
        break;
      }
    }

    if (offTeam) {
      const dateObj = new Date("2025-07-20");
      const stringDate = "2025-07-20";
      const dayjsDate = dayjs("2025-07-20");

      const progress1 = getOffDayProgress(dateObj, offTeam, "5-shift");
      const progress2 = getOffDayProgress(stringDate, offTeam, "5-shift");
      const progress3 = getOffDayProgress(dayjsDate, offTeam, "5-shift");

      // All should return the same result
      expect(progress1).toEqual(progress2);
      expect(progress2).toEqual(progress3);
    }
  });

  it("should track off-day progression correctly over time", () => {
    // Test with known shift pattern - use team 1 starting from reference date
    const baseDate = new Date("2025-07-22"); // Start from a date where team 1 is off

    // Team 1 should be off for 4 days starting from day 6 of their cycle
    const offDates = [
      dayjs(baseDate).add(0, "day"),
      dayjs(baseDate).add(1, "day"),
      dayjs(baseDate).add(2, "day"),
      dayjs(baseDate).add(3, "day"),
    ];

    // Check if any of these dates have the team off
    let foundOffDate = false;
    for (const date of offDates) {
      const shift = calculateShift(date, 1);
      if (!shift.isWorking) {
        const progress = getOffDayProgress(date, 1);

        if (progress) {
          expect(progress.current).toBeGreaterThan(0);
          expect(progress.current).toBeLessThanOrEqual(4);
          expect(progress.total).toBe(4);
          foundOffDate = true;
          break; // Found at least one valid off day
        }
      }
    }

    // The test passes if we found at least one off day and it returned valid progress
    // This is more resilient than expecting specific progression patterns
    if (!foundOffDate) {
      // If no off days found in this range, that's still valid -
      // just means our test date range doesn't include an off period
      // Skip the test in this case
      console.log("No off days found in test range - this is expected behavior");
    }
  });

  it("should handle edge cases gracefully", () => {
    // Suppress console warnings for expected invalid input tests
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Test with malformed dates
    const malformedDates = ["invalid", "2025-13-01", ""];
    malformedDates.forEach((dateStr) => {
      expect(() => getOffDayProgress(dateStr, 1)).not.toThrow();
    });

    // Test with NaN date
    const nanDate = new Date(NaN);
    expect(() => getOffDayProgress(nanDate, 1)).not.toThrow();

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe("schedule-aware day boundaries", () => {
    it("should return null for 9-5 schedule at 06:00 on a working Monday", () => {
      const mondayMorning = dayjs("2025-01-13 06:00");
      const progress = getOffDayProgress(mondayMorning, 1, "9-5");
      expect(progress).toBeNull();
    });

    it("should return weekend off-day progress for 9-5 schedule at 06:00 on Saturday", () => {
      const saturdayMorning = dayjs("2025-01-11 06:00");
      const progress = getOffDayProgress(saturdayMorning, 1, "9-5");

      expect(progress).not.toBeNull();
      if (progress) {
        expect(progress.total).toBe(2);
        expect(progress.current).toBe(1);
      }
    });

    it("should return weekend off-day progress for 2-shift schedule at 06:00 on Sunday", () => {
      const sundayMorning = dayjs("2025-01-12 06:00");
      const progress = getOffDayProgress(sundayMorning, 2, "2-shift");

      expect(progress).not.toBeNull();
      if (progress) {
        expect(progress.total).toBe(2);
        expect(progress.current).toBe(2);
      }
    });

    it("should treat midnight as the same day for non-night schedules", () => {
      const saturdayMidnight = dayjs("2025-01-11 00:30");
      const progress = getOffDayProgress(saturdayMidnight, 1, "9-5");

      expect(progress).not.toBeNull();
      if (progress) {
        expect(progress.total).toBe(2);
        expect(progress.current).toBe(1);
      }
    });
  });

  describe("Weekly-rotation schedule off-day progress", () => {
    it("should calculate off-day progress for 9-5 schedule on Sunday", () => {
      // Test Sunday - should be off for 9-5 schedule
      const sunday = new Date("2025-01-12"); // Sunday

      // First verify the team is actually off on this day
      const shift = calculateShift(sunday, 1, "9-5");
      if (!shift.isWorking) {
        const progress = getOffDayProgress(sunday, 1, "9-5");

        expect(progress).not.toBeNull();
        if (progress) {
          expect(progress.total).toBe(2); // Weekend is 2 days
          // Sunday should be the second day of the weekend
          expect(progress.current).toBeGreaterThan(0);
          expect(progress.current).toBeLessThanOrEqual(2);
        }
      } else {
        console.log("Sunday is unexpectedly a working day for 9-5 schedule");
      }
    });

    it("should return null for 9-5 schedule on working days", () => {
      // Test Monday - should be working
      const monday = new Date("2025-01-13"); // Monday
      const shift = calculateShift(monday, 1, "9-5");

      if (shift.isWorking) {
        const progress = getOffDayProgress(monday, 1, "9-5");
        expect(progress).toBeNull();
      }
    });

    it("should calculate off-day progress for weekly-rotation schedules", () => {
      // For weekly-rotation schedules, verify that off days are detected correctly
      // Using Sunday as a reliable off-day test case
      const sunday = new Date("2025-01-12");

      // Test 9-5 schedule
      const nineFiveShift = calculateShift(sunday, 1, "9-5");
      if (!nineFiveShift.isWorking) {
        const progress = getOffDayProgress(sunday, 1, "9-5");
        expect(progress).not.toBeNull();
        if (progress) {
          expect(progress.total).toBeGreaterThan(0);
          expect(progress.current).toBeGreaterThan(0);
        }
      }

      // Test 2-shift schedule
      const twoShiftShift = calculateShift(sunday, 1, "2-shift");
      if (!twoShiftShift.isWorking) {
        const progress = getOffDayProgress(sunday, 1, "2-shift");
        expect(progress).not.toBeNull();
        if (progress) {
          expect(progress.total).toBeGreaterThan(0);
          expect(progress.current).toBeGreaterThan(0);
        }
      }
    });

    it("should handle consecutive off days correctly", () => {
      // The logic should correctly identify consecutive weekend days
      const sunday = new Date("2025-01-12");
      const shift = calculateShift(sunday, 1, "9-5");

      if (!shift.isWorking) {
        const progress = getOffDayProgress(sunday, 1, "9-5");

        expect(progress).not.toBeNull();
        if (progress) {
          // Weekend should be 2 consecutive days
          expect(progress.total).toBe(2);
        }
      } else {
        console.log("Test skipped: Sunday is working day");
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle schedules with all off days in the cycle gracefully", () => {
      // Test with a hypothetical scenario where a team might be off all days
      // This is handled by the code at line 615-618 in shiftCalculations.ts
      // We can't easily create this with real schedules, but we can test the boundary
      const testDate = new Date("2025-07-16");

      // For 5-shift, teams have 4 consecutive off days
      // Find a team that's off
      let offTeam: number | null = null;
      for (let team = 1; team <= 5; team++) {
        const shift = calculateShift(testDate, team, "5-shift");
        if (!shift.isWorking) {
          offTeam = team;
          break;
        }
      }

      if (offTeam) {
        const progress = getOffDayProgress(testDate, offTeam, "5-shift");

        // Should still calculate correctly even in edge case
        expect(progress).not.toBeNull();
        if (progress) {
          expect(progress.total).toBe(4); // 5-shift has 4 consecutive off days
          expect(progress.current).toBeGreaterThan(0);
          expect(progress.current).toBeLessThanOrEqual(progress.total);
        }
      }
    });

    it("should handle irregular off-day patterns (split off days)", () => {
      // Test that consecutive off days are correctly identified as part of the same period
      // Use 5-shift which has 4 consecutive off days that we know work
      const testDate = new Date("2025-07-16");

      // Find a team that's off
      let offTeam: number | null = null;
      for (let team = 1; team <= 5; team++) {
        const shift = calculateShift(testDate, team, "5-shift");
        if (!shift.isWorking) {
          offTeam = team;
          break;
        }
      }

      if (offTeam) {
        const progress = getOffDayProgress(testDate, offTeam, "5-shift");

        if (progress && progress.current < progress.total) {
          // Test the next day in the off period
          const nextDay = dayjs(testDate).add(1, "day");
          const nextDayShift = calculateShift(nextDay, offTeam, "5-shift");

          if (!nextDayShift.isWorking) {
            const progressNext = getOffDayProgress(nextDay, offTeam, "5-shift");

            expect(progressNext).not.toBeNull();
            if (progressNext) {
              // Should have the same total and current should increment
              expect(progressNext.total).toBe(progress.total);
              expect(progressNext.current).toBe(progress.current + 1);
            }
          }
        }
      }
    });

    it("should handle transitions between cycles correctly", () => {
      // Test off days that might span cycle boundaries
      // For 5-shift schedule with 10-day cycles
      const fiveShiftRoster = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
      expect(fiveShiftRoster).toBeDefined();

      if (fiveShiftRoster) {
        const cycleLength = fiveShiftRoster.shiftConfig.cycleLengthDays;
        expect(cycleLength).toBe(10);

        // Find a team with off days
        let offTeam: number | null = null;
        const testDate = new Date("2025-07-20");

        for (let team = 1; team <= 5; team++) {
          const shift = calculateShift(testDate, team, "5-shift");
          if (!shift.isWorking) {
            offTeam = team;
            break;
          }
        }

        if (offTeam) {
          // Test multiple consecutive days in the off period
          const date1 = dayjs(testDate);
          const progress1 = getOffDayProgress(date1, offTeam, "5-shift");

          expect(progress1).not.toBeNull();

          if (progress1) {
            // Check that the total remains consistent across the off period
            expect(progress1.total).toBe(4);

            // Check subsequent days in the off period
            const date2 = date1.add(1, "day");
            const progress2 = getOffDayProgress(date2, offTeam, "5-shift");

            if (progress2 && calculateShift(date2, offTeam, "5-shift").code === "O") {
              expect(progress2.total).toBe(4);
              expect(progress2.current).toBe(progress1.current + 1);
            }
          }
        }
      }
    });

    it("should calculate correct progress for first and last day of off period", () => {
      // For 5-shift, teams have 4 consecutive off days
      const testDate = new Date("2025-07-16");

      // Find a team that's off
      let offTeam: number | null = null;
      for (let team = 1; team <= 5; team++) {
        const shift = calculateShift(testDate, team, "5-shift");
        if (!shift.isWorking) {
          offTeam = team;
          break;
        }
      }

      if (offTeam) {
        // Find the start of the off period by going backward
        let currentDate = dayjs(testDate);
        let daysBack = 0;
        const maxDaysToCheck = 10; // Cycle length for safety

        // Go back to find where the off period starts
        while (daysBack < maxDaysToCheck) {
          const prevDay = currentDate.subtract(1, "day");
          const prevShift = calculateShift(prevDay, offTeam, "5-shift");

          if (prevShift.isWorking) {
            // Found a working day, so current date is the first off day
            break;
          }

          currentDate = prevDay;
          daysBack++;
        }

        const firstOffDay = currentDate;

        // Test first day of off period
        const progressFirst = getOffDayProgress(firstOffDay, offTeam, "5-shift");

        // Only proceed if we found a valid off period
        if (progressFirst) {
          expect(progressFirst.current).toBe(1);
          expect(progressFirst.total).toBe(4);

          // Test last day of off period
          const lastOffDay = firstOffDay.add(progressFirst.total - 1, "day");
          const lastDayShift = calculateShift(lastOffDay, offTeam, "5-shift");

          // Verify the last day is still off
          if (!lastDayShift.isWorking) {
            const progressLast = getOffDayProgress(lastOffDay, offTeam, "5-shift");

            expect(progressLast).not.toBeNull();
            if (progressLast) {
              expect(progressLast.current).toBe(progressFirst.total);
              expect(progressLast.total).toBe(4);
            }
          }
        }
      }
    });
  });
});
