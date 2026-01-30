import { describe, expect, it } from "vitest";
import { SCHEDULE_OPTIONS, SHIFT_CODES } from "../../src/data/rosters";

describe("Schedule pattern validation", () => {
  it("should pass validation for all existing schedules", () => {
    // This test verifies the validation function works with current configs
    // The validation runs at module load, so if we got here, it passed
    expect(SCHEDULE_OPTIONS.length).toBeGreaterThan(0);
    expect(SCHEDULE_OPTIONS).toHaveLength(4);
  });

  it("should have all required fields in each schedule", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      expect(schedule.value).toBeDefined();
      expect(schedule.title).toBeDefined();
      expect(schedule.description).toBeDefined();
      expect(schedule.showsTeamSelection).toBeDefined();
      expect(schedule.isAvailable).toBeDefined();
      expect(schedule.shiftConfig).toBeDefined();
    });
  });

  it("should have valid shift config for each schedule", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      const config = schedule.shiftConfig;
      expect(config.teamCount).toBeGreaterThan(0);
      expect(config.cycleLengthDays).toBeGreaterThan(0);
      expect(config.shiftsPerDay).toBeGreaterThan(0);
      expect(config.referenceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(config.referenceTeam).toBeGreaterThan(0);
      expect(config.referenceTeam).toBeLessThanOrEqual(config.teamCount);
      expect(config.schedulePattern).toBeDefined();
      expect(config.schedulePattern.length).toBe(config.cycleLengthDays);
    });
  });

  it("should define shiftTimes for every shift used in schedulePattern", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      const { schedulePattern, shiftTimes } = schedule.shiftConfig;

      schedulePattern.forEach((shift) => {
        const definition = shiftTimes[shift];
        expect(definition).toBeDefined();
        if (!definition) return;

        expect(typeof definition.name).toBe("string");
        expect(definition.name.length).toBeGreaterThan(0);
        expect(typeof definition.displayCode).toBe("string");
        expect(definition.displayCode.length).toBeGreaterThan(0);

        if (shift === "O") {
          expect(definition.start).toBeNull();
          expect(definition.end).toBeNull();
        } else {
          expect(typeof definition.start).toBe("number");
          expect(typeof definition.end).toBe("number");
        }
      });
    });
  });

  it("should have valid shift time ranges", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      Object.entries(schedule.shiftConfig.shiftTimes).forEach(([shift, definition]) => {
        if (!definition) return;

        if (shift === "O") {
          expect(definition.start).toBeNull();
          expect(definition.end).toBeNull();
          return;
        }

        expect(definition.start).toBeGreaterThanOrEqual(0);
        expect(definition.start).toBeLessThanOrEqual(24);
        expect(definition.end).toBeGreaterThanOrEqual(0);
        expect(definition.end).toBeLessThanOrEqual(24);

        if (shift === "N") {
          expect(definition.start).toBeGreaterThan(definition.end);
        } else {
          expect(definition.start).toBeLessThan(definition.end);
        }
      });
    });
  });

  it("should only use valid shift codes", () => {
    const validCodes = new Set(SHIFT_CODES);
    SCHEDULE_OPTIONS.forEach((schedule) => {
      const { schedulePattern } = schedule.shiftConfig;
      schedulePattern.forEach((shift) => {
        expect(validCodes.has(shift)).toBe(true);
      });
    });
  });

  it("should have 9-5 schedule available", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "9-5");
    expect(schedule).toBeDefined();
    expect(schedule?.isAvailable).toBe(true);
    expect(schedule?.showsTeamSelection).toBe(false);
    expect(schedule?.shiftConfig.teamCount).toBe(1);
  });

  it("should have 5-shift schedule available", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    expect(schedule).toBeDefined();
    expect(schedule?.isAvailable).toBe(true);
    expect(schedule?.showsTeamSelection).toBe(true);
    expect(schedule?.shiftConfig.teamCount).toBe(5);
  });

  it("should have 2-shift schedule marked as coming soon", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "2-shift");
    expect(schedule).toBeDefined();
    expect(schedule?.isAvailable).toBe(false);
  });

  it("should have weekend-shift schedule marked as coming soon", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "weekend-shift");
    expect(schedule).toBeDefined();
    expect(schedule?.isAvailable).toBe(false);
  });

  it("should have documented notes field for developer reference", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      // Notes field is optional but if present should be a string
      if (schedule.shiftConfig.notes) {
        expect(typeof schedule.shiftConfig.notes).toBe("string");
        expect(schedule.shiftConfig.notes.length).toBeGreaterThan(0);
      }
    });
  });

  it("should have 5-shift schedule with correct 10-day cycle pattern", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "5-shift");
    expect(schedule?.shiftConfig.cycleLengthDays).toBe(10);
    expect(schedule?.shiftConfig.schedulePattern).toHaveLength(10);

    // Verify the expected pattern: M, M, L, L, N, N, O, O, O, O
    const pattern = schedule?.shiftConfig.schedulePattern;
    expect(pattern).toEqual(["M", "M", "L", "L", "N", "N", "O", "O", "O", "O"]);
  });

  it("should have 9-5 schedule with correct 7-day cycle pattern", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "9-5");
    expect(schedule?.shiftConfig.cycleLengthDays).toBe(7);
    expect(schedule?.shiftConfig.schedulePattern).toHaveLength(7);

    // Verify the expected pattern: D, D, D, D, D, O, O (Mon-Fri work, weekend off)
    const pattern = schedule?.shiftConfig.schedulePattern;
    expect(pattern).toEqual(["D", "D", "D", "D", "D", "O", "O"]);
  });

  it("should have valid reference dates", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      const refDate = schedule.shiftConfig.referenceDate;
      // Validate ISO date format YYYY-MM-DD
      expect(refDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Validate it's a real date
      const date = new Date(refDate);
      expect(date.toString()).not.toBe("Invalid Date");
    });
  });
});
