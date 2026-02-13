import { describe, it, expect } from "vitest";
import {
  BREAK_DURATION_MINUTES,
  effectiveDurationHours,
  calculateBreakPosition,
} from "../../../src/components/timeTracking/timeUtils";

describe("Break Deduction", () => {
  describe("constants", () => {
    it("defines break duration as 30 minutes", () => {
      expect(BREAK_DURATION_MINUTES).toBe(30);
    });
  });

  describe("effectiveDurationHours", () => {
    it("returns raw hours when includesBreak is falsy", () => {
      expect(effectiveDurationHours(8, false)).toBe(8);
      expect(effectiveDurationHours(8, undefined)).toBe(8);
      expect(effectiveDurationHours(8)).toBe(8);
    });

    it("deducts 30 minutes when includesBreak is true", () => {
      // 8 hours - 0.5 hours = 7.5 hours
      expect(effectiveDurationHours(8, true)).toBe(7.5);
    });

    it("deducts from various durations correctly", () => {
      // 2.5 hours - 0.5 = 2.0
      expect(effectiveDurationHours(2.5, true)).toBe(2.0);
      // 1 hour - 0.5 = 0.5
      expect(effectiveDurationHours(1, true)).toBe(0.5);
      // 0.5 hours - 0.5 = 0
      expect(effectiveDurationHours(0.5, true)).toBe(0);
    });

    it("caps deduction at raw duration (never goes negative)", () => {
      // 0.25 hours (15 min) task with 30 min break = 0, not -0.25
      expect(effectiveDurationHours(0.25, true)).toBe(0);
      // 0 hours
      expect(effectiveDurationHours(0, true)).toBe(0);
    });

    it("handles zero hours correctly", () => {
      expect(effectiveDurationHours(0, false)).toBe(0);
      expect(effectiveDurationHours(0, true)).toBe(0);
    });

    it("handles fractional hours correctly", () => {
      // 3.75 hours (3h 45m) - 0.5 = 3.25
      expect(effectiveDurationHours(3.75, true)).toBe(3.25);
    });
  });

  describe("calculateBreakPosition", () => {
    // Lunch window: 11:30 (690min) to 13:30 (810min)

    it("returns zeros for zero-duration task", () => {
      const result = calculateBreakPosition(480, 480); // 8:00 to 8:00
      expect(result).toEqual({ beforeHours: 0, breakHours: 0, afterHours: 0 });
    });

    it("returns zeros for negative-duration task", () => {
      const result = calculateBreakPosition(600, 480); // 10:00 to 8:00
      expect(result).toEqual({ beforeHours: 0, breakHours: 0, afterHours: 0 });
    });

    it("places break at 11:30 for full-day task spanning lunch window", () => {
      // 8:00 (480) to 17:00 (1020) — break at 11:30 (690)
      const result = calculateBreakPosition(480, 1020);
      // Before: 8:00-11:30 = 210min = 3.5h
      expect(result.beforeHours).toBe(3.5);
      // Break: 30min = 0.5h
      expect(result.breakHours).toBe(0.5);
      // After: 12:00-17:00 = 300min = 5h
      expect(result.afterHours).toBe(5);
    });

    it("places break at task start when task starts inside lunch window", () => {
      // 12:00 (720) to 16:00 (960) — task starts inside window
      const result = calculateBreakPosition(720, 960);
      // Break starts at max(720, 690) = 720, so before = 0
      expect(result.beforeHours).toBe(0);
      // Break: 30min = 0.5h
      expect(result.breakHours).toBe(0.5);
      // After: 12:30-16:00 = 210min = 3.5h
      expect(result.afterHours).toBe(3.5);
    });

    it("places break at end for task ending before lunch window", () => {
      // 8:00 (480) to 11:00 (660) — task ends before 11:30
      const result = calculateBreakPosition(480, 660);
      // Before: 8:00-10:30 = 150min = 2.5h
      expect(result.beforeHours).toBe(2.5);
      // Break: 30min = 0.5h
      expect(result.breakHours).toBe(0.5);
      // After: 0
      expect(result.afterHours).toBe(0);
    });

    it("places break at start for task starting after lunch window", () => {
      // 14:00 (840) to 18:00 (1080) — task starts after 13:30
      const result = calculateBreakPosition(840, 1080);
      // Before: 0
      expect(result.beforeHours).toBe(0);
      // Break: 0.5h
      expect(result.breakHours).toBe(0.5);
      // After: 14:30-18:00 = 210min = 3.5h
      expect(result.afterHours).toBe(3.5);
    });

    it("places break at lunch window start when task starts before window", () => {
      // 10:00 (600) to 14:00 (840) — overlaps lunch window
      const result = calculateBreakPosition(600, 840);
      // Break at 11:30: before = 10:00-11:30 = 90min = 1.5h
      expect(result.beforeHours).toBe(1.5);
      expect(result.breakHours).toBe(0.5);
      // After: 12:00-14:00 = 120min = 2h
      expect(result.afterHours).toBe(2);
    });

    it("caps break duration at task duration for short tasks", () => {
      // 12:00 (720) to 12:15 (735) — 15 minute task, shorter than 30min break
      const result = calculateBreakPosition(720, 735);
      expect(result.breakHours).toBe(0.25); // 15 min
      expect(result.beforeHours).toBe(0);
      expect(result.afterHours).toBe(0);
    });

    it("handles task ending exactly at lunch window start", () => {
      // 8:00 (480) to 11:30 (690) — ends right at window start
      const result = calculateBreakPosition(480, 690);
      // Break placed at end: 11:00-11:30
      expect(result.beforeHours).toBe(3);
      expect(result.breakHours).toBe(0.5);
      expect(result.afterHours).toBe(0);
    });

    it("handles task starting exactly at lunch window end", () => {
      // 13:30 (810) to 17:00 (1020) — starts right at window end
      const result = calculateBreakPosition(810, 1020);
      // Break placed at start: 13:30-14:00
      expect(result.beforeHours).toBe(0);
      expect(result.breakHours).toBe(0.5);
      expect(result.afterHours).toBe(3);
    });

    it("sums of parts equal total task duration", () => {
      // Verify for several different time ranges that before + break + after = total
      const cases = [
        [480, 1020], // 8:00-17:00
        [600, 840], // 10:00-14:00
        [720, 960], // 12:00-16:00
        [480, 660], // 8:00-11:00
        [840, 1080], // 14:00-18:00
      ] as const;

      for (const [start, stop] of cases) {
        const result = calculateBreakPosition(start, stop);
        const totalMinutes = result.beforeHours * 60 + result.breakHours * 60 + result.afterHours * 60;
        expect(totalMinutes).toBeCloseTo(stop - start, 5);
      }
    });
  });
});
