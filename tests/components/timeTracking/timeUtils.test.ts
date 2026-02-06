import { describe, expect, it } from "vitest";
import {
  timeToMinutes,
  isValidRange,
  calculateDurationHours,
  overlaps,
} from "../../../src/components/timeTracking/timeUtils";

describe("Time Tracking Utils", () => {
  describe("timeToMinutes", () => {
    it("should convert valid time to minutes", () => {
      expect(timeToMinutes("00:00")).toBe(0);
      expect(timeToMinutes("01:00")).toBe(60);
      expect(timeToMinutes("12:30")).toBe(750);
      expect(timeToMinutes("23:59")).toBe(1439);
    });

    it("should handle leading zeros", () => {
      expect(timeToMinutes("08:05")).toBe(485);
      expect(timeToMinutes("00:01")).toBe(1);
    });

    it("should throw error for invalid format", () => {
      expect(() => timeToMinutes("12")).toThrow('Invalid time format "12". Expected HH:MM.');
      expect(() => timeToMinutes("12:30:45")).toThrow(
        'Invalid time format "12:30:45". Expected HH:MM.',
      );
      expect(() => timeToMinutes("")).toThrow('Invalid time format "". Expected HH:MM.');
    });

    it("should throw error for non-numeric values", () => {
      expect(() => timeToMinutes("ab:cd")).toThrow(
        'Invalid time value "ab:cd". Expected numeric hours and minutes.',
      );
      expect(() => timeToMinutes("12:xyz")).toThrow(
        'Invalid time value "12:xyz". Expected numeric hours and minutes.',
      );
    });

    it("should throw error for invalid time values", () => {
      expect(() => timeToMinutes("-1:00")).toThrow(
        'Invalid time value "-1:00". Hours must be >= 0 and minutes 0-59.',
      );
      expect(() => timeToMinutes("12:-5")).toThrow(
        'Invalid time value "12:-5". Hours must be >= 0 and minutes 0-59.',
      );
      expect(() => timeToMinutes("12:60")).toThrow(
        'Invalid time value "12:60". Hours must be >= 0 and minutes 0-59.',
      );
    });

    it("should handle 24-hour format", () => {
      expect(timeToMinutes("24:00")).toBe(1440);
      expect(timeToMinutes("25:30")).toBe(1530);
    });
  });

  describe("isValidRange", () => {
    it("should return true for valid ranges", () => {
      expect(isValidRange("08:00", "17:00")).toBe(true);
      expect(isValidRange("00:00", "23:59")).toBe(true);
      expect(isValidRange("12:00", "12:01")).toBe(true);
    });

    it("should return true for overnight ranges", () => {
      expect(isValidRange("17:00", "08:00")).toBe(true);
      expect(isValidRange("23:00", "07:00")).toBe(true);
      expect(isValidRange("12:30", "12:00")).toBe(true);
    });

    it("should return false when start equals stop", () => {
      expect(isValidRange("12:00", "12:00")).toBe(false);
    });

    it("should return false for invalid time formats", () => {
      expect(isValidRange("invalid", "17:00")).toBe(false);
      expect(isValidRange("08:00", "invalid")).toBe(false);
      expect(isValidRange("25:61", "26:70")).toBe(false);
    });

    it("should handle midnight crossings correctly", () => {
      expect(isValidRange("23:59", "00:01")).toBe(true);
    });
  });

  describe("calculateDurationHours", () => {
    it("should calculate duration in hours", () => {
      expect(calculateDurationHours("08:00", "17:00")).toBe(9);
      expect(calculateDurationHours("09:00", "12:00")).toBe(3);
      expect(calculateDurationHours("00:00", "24:00")).toBe(24);
    });

    it("should handle fractional hours", () => {
      expect(calculateDurationHours("08:00", "08:30")).toBe(0.5);
      expect(calculateDurationHours("09:00", "10:15")).toBe(1.25);
      expect(calculateDurationHours("14:30", "16:45")).toBe(2.25);
    });

    it("should handle same start and stop time", () => {
      expect(calculateDurationHours("12:00", "12:00")).toBe(0);
    });

    it("should handle very short durations", () => {
      expect(calculateDurationHours("12:00", "12:01")).toBeCloseTo(1 / 60, 5);
    });

    it("should handle overnight durations (stop before start)", () => {
      expect(calculateDurationHours("17:00", "08:00")).toBe(15);
      expect(calculateDurationHours("23:00", "07:00")).toBe(8);
    });
  });

  describe("overlaps", () => {
    const tasks = [
      { id: "1", start: "08:00", stop: "12:00" },
      { id: "2", start: "13:00", stop: "17:00" },
      { id: "3", start: "09:00", stop: "11:00" },
    ];

    it("should detect overlap with existing tasks", () => {
      expect(overlaps("08:30", "09:30", tasks)).toBe(true);
      expect(overlaps("10:00", "14:00", tasks)).toBe(true);
      expect(overlaps("16:00", "18:00", tasks)).toBe(true);
    });

    it("should detect overlap at boundaries", () => {
      expect(overlaps("07:00", "08:01", tasks)).toBe(true);
      expect(overlaps("11:59", "13:30", tasks)).toBe(true);
    });

    it("should not detect overlap for non-overlapping times", () => {
      expect(overlaps("07:00", "08:00", tasks)).toBe(false);
      expect(overlaps("12:00", "13:00", tasks)).toBe(false);
      expect(overlaps("17:00", "18:00", tasks)).toBe(false);
    });

    it("should detect complete containment as overlap", () => {
      expect(overlaps("09:30", "10:30", tasks)).toBe(true); // Inside task 3
      expect(overlaps("07:00", "18:00", tasks)).toBe(true); // Contains all tasks
    });

    it("should skip task with matching skipId", () => {
      expect(overlaps("08:30", "09:30", tasks, "1")).toBe(true); // Overlaps with task 3
      expect(overlaps("08:30", "09:30", tasks, "3")).toBe(true); // Overlaps with task 1
      expect(overlaps("13:30", "14:30", tasks, "2")).toBe(false); // Only overlaps with task 2, which is skipped
    });

    it("should handle empty task list", () => {
      expect(overlaps("08:00", "12:00", [])).toBe(false);
    });

    it("should handle adjacent times without overlap", () => {
      // Task ends at 12:00, new starts at 12:00 - should not overlap
      expect(overlaps("12:00", "13:00", tasks)).toBe(false);
    });

    it("should detect overlap when new task contains existing task", () => {
      expect(overlaps("08:00", "18:00", tasks)).toBe(true);
    });

    it("should detect overlap when new task is contained by existing task", () => {
      expect(overlaps("08:30", "11:30", tasks)).toBe(true);
    });

    it("should handle single minute overlap", () => {
      expect(overlaps("11:59", "12:01", tasks)).toBe(true);
    });
  });
});
