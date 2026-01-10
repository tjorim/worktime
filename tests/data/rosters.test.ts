import { describe, expect, it } from "vitest";
import { SCHEDULE_OPTIONS } from "../../src/data/rosters";

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
      expect(config.schedulePattern.days).toBeDefined();
      expect(config.schedulePattern.days.length).toBe(config.cycleLengthDays);
    });
  });

  it("should have sequential day indices starting from 1", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      const { schedulePattern, cycleLengthDays } = schedule.shiftConfig;
      const dayIndices = schedulePattern.days.map((d) => d.dayIndex);
      const expectedIndices = Array.from({ length: cycleLengthDays }, (_, i) => i + 1);
      expect(dayIndices).toEqual(expectedIndices);
    });
  });

  it("should only use valid shift codes", () => {
    const validCodes = new Set(["M", "L", "N", "D", "O"]);
    SCHEDULE_OPTIONS.forEach((schedule) => {
      const { schedulePattern } = schedule.shiftConfig;
      schedulePattern.days.forEach((day) => {
        expect(validCodes.has(day.shift)).toBe(true);
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
    expect(schedule?.shiftConfig.schedulePattern.days).toHaveLength(10);

    // Verify the expected pattern: M, M, L, L, N, N, O, O, O, O
    const pattern = schedule?.shiftConfig.schedulePattern.days.map((d) => d.shift);
    expect(pattern).toEqual(["M", "M", "L", "L", "N", "N", "O", "O", "O", "O"]);
  });

  it("should have 9-5 schedule with correct 7-day cycle pattern", () => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === "9-5");
    expect(schedule?.shiftConfig.cycleLengthDays).toBe(7);
    expect(schedule?.shiftConfig.schedulePattern.days).toHaveLength(7);

    // Verify the expected pattern: D, D, D, D, D, O, O (Mon-Fri work, weekend off)
    const pattern = schedule?.shiftConfig.schedulePattern.days.map((d) => d.shift);
    expect(pattern).toEqual(["D", "D", "D", "D", "D", "O", "O"]);
  });

  it("should have display overrides properly structured", () => {
    SCHEDULE_OPTIONS.forEach((schedule) => {
      if (schedule.shiftConfig.shiftDisplayOverrides) {
        const overrides = schedule.shiftConfig.shiftDisplayOverrides;
        Object.entries(overrides).forEach(([code, override]) => {
          expect(["M", "L", "N", "D", "O"]).toContain(code);
          if (override.displayName) {
            expect(typeof override.displayName).toBe("string");
          }
          if (override.displayCode) {
            expect(typeof override.displayCode).toBe("string");
          }
          if (override.displayHours) {
            expect(typeof override.displayHours).toBe("string");
          }
        });
      }
    });
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
