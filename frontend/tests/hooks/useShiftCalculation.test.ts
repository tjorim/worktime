import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { useShiftCalculation } from "@/hooks/useShiftCalculation";
import { dayjs } from "@/utils/dateTimeUtils";
import { calculateShift, getShiftCode } from "@/utils/shiftCalculations";

function wrapper({ children }: { children: ReactNode }) {
  return React.createElement(SettingsProvider, null, children);
}

/**
 * Creates a wrapper with a specific scheduleType and team pre-configured via localStorage.
 */
function createWrapperWithSettings(scheduleType: "5-shift" | "9-5", myTeam: number | null = null) {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      hasCompletedOnboarding: true,
      myTeam,
      scheduleType,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
        enableTimeOff: false,
        enableTimeTracking: false,
      },
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      },
    }),
  );

  return function SettingsWrapper({ children }: { children: ReactNode }) {
    return React.createElement(SettingsProvider, null, children);
  };
}

describe("useShiftCalculation", () => {
  describe("Initialization", () => {
    it("initializes with default values", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      expect(result.current.myTeam).toBeNull();
      expect(dayjs.isDayjs(result.current.currentDate)).toBe(true);
      expect(result.current.currentShift).toBeNull();
    });

    it("initializes with a null team before settings are loaded", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      // Should start with default null value
      expect(result.current.myTeam).toBeNull();
    });
  });

  describe("Team Selection", () => {
    it("updates my team", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      act(() => {
        result.current.setMyTeam(3);
      });

      expect(result.current.myTeam).toBe(3);
    });

    it("clears my team", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      // First set a team
      act(() => {
        result.current.setMyTeam(3);
      });
      expect(result.current.myTeam).toBe(3);

      // Then clear it
      act(() => {
        result.current.setMyTeam(null);
      });

      expect(result.current.myTeam).toBeNull();
    });
  });

  describe("Date Management", () => {
    it("updates current date", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });
      const newDate = dayjs("2025-01-15");

      act(() => {
        result.current.setCurrentDate(newDate);
      });

      expect(result.current.currentDate.isSame(newDate, "day")).toBe(true);
    });
  });

  describe("Shift Data Integration", () => {
    it("calculates current shift for my team", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      act(() => {
        result.current.setMyTeam(1);
      });

      expect(result.current.currentShift).not.toBeNull();
      expect(result.current.currentShift?.teamNumber).toBe(1);
    });

    it("calculates today shifts for all teams", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      expect(result.current.todayShifts).toHaveLength(5); // CONFIG.TEAMS_COUNT
      expect(
        result.current.todayShifts.every((shift) => shift.teamNumber >= 1 && shift.teamNumber <= 5),
      ).toBe(true);
    });

    it("calculates next shift for my team", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      act(() => {
        result.current.setMyTeam(1);
      });

      expect(result.current.nextShift).not.toBeNull();
      expect(result.current.nextShift?.shift).toBeDefined();
    });

    it("returns null for current shift when no team selected", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      expect(result.current.currentShift).toBeNull();
      expect(result.current.nextShift).toBeNull();
    });

    it("provides current shift day", () => {
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper,
      });

      expect(dayjs.isDayjs(result.current.currentShiftDay)).toBe(true);
    });
  });

  describe("Schedule Type Variations", () => {
    afterEach(() => {
      window.localStorage.removeItem("worktime_user_state");
    });

    it("calculates shifts correctly for 5-shift schedule", () => {
      const testWrapper = createWrapperWithSettings("5-shift", 2);
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper: testWrapper,
      });

      // Team 2 should be set from localStorage
      expect(result.current.myTeam).toBe(2);
      expect(result.current.currentShift).not.toBeNull();
      expect(result.current.currentShift?.teamNumber).toBe(2);

      // Verify the shift matches direct calculation
      const directShift = calculateShift(result.current.currentDate, 2, "5-shift");
      expect(result.current.currentShift?.shift.code).toBe(directShift.code);
    });

    it("calculates shifts correctly for 9-5 schedule", () => {
      // For 9-5 schedule, team is always 1 (single-user schedule)
      const testWrapper = createWrapperWithSettings("9-5", null);
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper: testWrapper,
      });

      // 9-5 schedule should have validatedMyTeam = 1 (single-user)
      expect(result.current.currentShift).not.toBeNull();
      expect(result.current.currentShift?.teamNumber).toBe(1);

      // Verify shift matches direct calculation for 9-5
      const directShift = calculateShift(result.current.currentDate, 1, "9-5");
      expect(result.current.currentShift?.shift.code).toBe(directShift.code);
    });

    it("returns correct todayShifts count based on schedule type", () => {
      // 5-shift has 5 teams
      const fiveShiftWrapper = createWrapperWithSettings("5-shift", 1);
      const { result: fiveShiftResult } = renderHook(() => useShiftCalculation(), {
        wrapper: fiveShiftWrapper,
      });
      expect(fiveShiftResult.current.todayShifts).toHaveLength(5);

      // Clean up before next test
      window.localStorage.removeItem("worktime_user_state");

      // 9-5 has 1 team
      const nineToFiveWrapper = createWrapperWithSettings("9-5", null);
      const { result: nineToFiveResult } = renderHook(() => useShiftCalculation(), {
        wrapper: nineToFiveWrapper,
      });
      expect(nineToFiveResult.current.todayShifts).toHaveLength(1);
    });
  });

  describe("Calendar-Day Shift Behavior (Pre-7AM)", () => {
    afterEach(() => {
      window.localStorage.removeItem("worktime_user_state");
    });

    it("uses calendar day for currentShift, not shift day, before 7 AM", () => {
      // Regression test: At Monday 00:20, schedule display should show Monday's shift
      const testWrapper = createWrapperWithSettings("5-shift", 2);
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper: testWrapper,
      });

      // Set date to Monday Jan 26, 2026 at 00:20 (before 7 AM)
      const mondayPreSeven = dayjs("2026-01-26 00:20");
      act(() => {
        result.current.setCurrentDate(mondayPreSeven);
      });

      // currentShift should use calendar day (Monday), not shift day (Sunday)
      expect(result.current.currentShift).not.toBeNull();

      // The hook's currentShift.date should be the calendar day
      expect(result.current.currentShift?.date.isSame(mondayPreSeven, "day")).toBe(true);

      // Verify against direct calculations:
      // Calendar day calculation (correct for display)
      const calendarDayShift = calculateShift(mondayPreSeven.startOf("day"), 2, "5-shift");
      expect(calendarDayShift.code).toBe("L"); // Monday = Evening for Team 2

      // The hook should match the calendar day calculation
      expect(result.current.currentShift?.shift.code).toBe(calendarDayShift.code);

      // Shift day would give Sunday's shift (incorrect for display)
      expect(result.current.currentShiftDay.isSame(mondayPreSeven.subtract(1, "day"), "day")).toBe(
        true,
      );
    });

    it("currentShift.code matches getShiftCode for pre-7AM times", () => {
      const testWrapper = createWrapperWithSettings("5-shift", 2);
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper: testWrapper,
      });

      // Friday Jan 30, 2026 at 02:00 (before 7 AM)
      const fridayPreSeven = dayjs("2026-01-30 02:00");
      act(() => {
        result.current.setCurrentDate(fridayPreSeven);
      });

      // Verify currentShift.code matches getShiftCode(currentDate, team, scheduleType)
      const expectedCode = getShiftCode(fridayPreSeven, 2, "5-shift");
      expect(result.current.currentShift?.code).toBe(expectedCode);

      // Team 2 on Friday Jan 30 should be Off
      const fridayShift = calculateShift(fridayPreSeven.startOf("day"), 2, "5-shift");
      expect(fridayShift.code).toBe("O");
      expect(result.current.currentShift?.shift.code).toBe("O");
    });

    it("distinguishes between currentShift.date (calendar) and currentShiftDay (shift boundary)", () => {
      const testWrapper = createWrapperWithSettings("5-shift", 2);
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper: testWrapper,
      });

      // At 03:00 on a day, calendar day and shift day differ
      const earlyMorning = dayjs("2026-01-26 03:00");
      act(() => {
        result.current.setCurrentDate(earlyMorning);
      });

      // currentShift.date should be the calendar day (Monday)
      expect(result.current.currentShift?.date.format("YYYY-MM-DD")).toBe("2026-01-26");

      // currentShiftDay should be the previous day (Sunday) due to pre-7AM logic
      expect(result.current.currentShiftDay.format("YYYY-MM-DD")).toBe("2026-01-25");
    });

    it("after 7 AM, calendar day and shift day are the same", () => {
      const testWrapper = createWrapperWithSettings("5-shift", 2);
      const { result } = renderHook(() => useShiftCalculation(), {
        wrapper: testWrapper,
      });

      // At 10:00, both should be the same day
      const midMorning = dayjs("2026-01-26 10:00");
      act(() => {
        result.current.setCurrentDate(midMorning);
      });

      expect(result.current.currentShift?.date.format("YYYY-MM-DD")).toBe("2026-01-26");
      expect(result.current.currentShiftDay.format("YYYY-MM-DD")).toBe("2026-01-26");
    });
  });
});
