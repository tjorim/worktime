import { describe, it, expect } from "vitest";
import {
  BREAK_DURATION_MINUTES,
  BREAK_THRESHOLD_HOURS,
  effectiveDurationHours,
} from "../../../src/components/timeTracking/timeUtils";

describe("Break Deduction", () => {
  describe("constants", () => {
    it("defines break duration as 30 minutes", () => {
      expect(BREAK_DURATION_MINUTES).toBe(30);
    });

    it("defines break threshold as 5.5 hours", () => {
      expect(BREAK_THRESHOLD_HOURS).toBe(5.5);
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
});
