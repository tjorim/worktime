import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsProvider, useSettings } from "../../src/contexts/SettingsContext";

describe("SettingsContext unified user state", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <SettingsProvider>{children}</SettingsProvider>;
  }

  afterEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute("data-bs-theme");
  });

  it("provides default values and mutators", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.settings.theme).toBe("auto");
    expect(result.current.settings.notifications).toBe("off");
    expect(result.current.settings.vacationAllowance).toEqual({
      amount: 0,
      unit: "days",
      hoursPerDay: 8,
    });
    expect(result.current.myTeam).toBe(null);
    expect(result.current.scheduleType).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it("updates settings and user state", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {
      result.current.updateTimeFormat("12h");
    });
    expect(result.current.settings.timeFormat).toBe("12h");
    await act(async () => {
      result.current.updateTheme("dark");
    });
    expect(result.current.settings.theme).toBe("dark");
    await act(async () => {
      result.current.updateNotifications("on");
    });
    expect(result.current.settings.notifications).toBe("on");
    await act(async () => {
      result.current.updateVacationAllowance({ amount: 28, unit: "hours" });
    });
    expect(result.current.settings.vacationAllowance).toEqual({
      amount: 28,
      unit: "hours",
      hoursPerDay: 8,
    });
    await act(async () => {
      result.current.setMyTeam(3);
    });
    expect(result.current.myTeam).toBe(3);
    await act(async () => {
      result.current.setHasCompletedOnboarding(true);
    });
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it("updates schedule option and persists it", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      result.current.setScheduleType("5-shift");
    });

    expect(result.current.scheduleType).toBe("5-shift");

    const stored = window.localStorage.getItem("worktime_user_state");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored || "{}");
    expect(parsed.scheduleType).toBe("5-shift");
  });

  it("resets all user state", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    act(() => {
      result.current.setMyTeam(2);
      result.current.setHasCompletedOnboarding(true);
      result.current.resetSettings();
    });
    expect(result.current.myTeam).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.scheduleType).toBe(null);
  });

  it("validates and falls back to default state if corrupted", () => {
    // Simulate corrupted state in localStorage
    window.localStorage.setItem("worktime_user_state", JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.myTeam).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.scheduleType).toBe(null);
  });

  it("migrates from old keys to unified state (documented gap)", () => {
    window.localStorage.setItem("hasCompletedOnboarding", "true");
    window.localStorage.setItem("worktime_user_preferences", JSON.stringify({ myTeam: 2 }));
    window.localStorage.setItem(
      "userSettings",
      JSON.stringify({
        timeFormat: "12h",
        theme: "dark",
        notifications: "on",
      }),
    );
    // Simulate first load with legacy keys
    const { result } = renderHook(() => useSettings(), { wrapper });
    // Should fallback to default, as migration is not implemented, but this test documents the gap
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.myTeam).toBe(null);
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.scheduleType).toBe(null);
  });

  it("resetSettings clears unified key and does not leave old keys", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    act(() => {
      result.current.setMyTeam(1);
      result.current.setHasCompletedOnboarding(true);
      result.current.updateTimeFormat("12h");
    });
    act(() => {
      result.current.resetSettings();
    });

    // Check the unified storage key
    const userStateStored = window.localStorage.getItem("worktime_user_state");
    expect(userStateStored).not.toBeNull();
    const parsedState = JSON.parse(userStateStored || "{}");
    expect(parsedState).toEqual({
      version: 1,
      hasCompletedOnboarding: false,
      myTeam: null,
      scheduleType: null,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: {
          amount: 0,
          unit: "days",
          hoursPerDay: 8,
        },
        enableTimeOff: false,
        enableTimeTracking: false,
        timeTrackingWeeklyTargetHours: 40,
      },
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      },
    });

    // Check that all old/legacy keys are null (not written by the implementation)
    expect(window.localStorage.getItem("hasCompletedOnboarding")).toBeNull();
    expect(window.localStorage.getItem("worktime_user_preferences")).toBeNull();
    expect(window.localStorage.getItem("userSettings")).toBeNull();
  });

  it("updates theme setting without DOM side effects", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    // Initially should be 'auto'
    expect(result.current.settings.theme).toBe("auto");

    // Update to dark theme
    act(() => {
      result.current.updateTheme("dark");
    });
    expect(result.current.settings.theme).toBe("dark");

    // Update to light theme
    act(() => {
      result.current.updateTheme("light");
    });
    expect(result.current.settings.theme).toBe("light");

    // SettingsContext should not apply theme to DOM - that's App.tsx responsibility
    expect(document.documentElement.getAttribute("data-bs-theme")).toBeNull();
  });

  describe("Vacation Allowance Settings", () => {
    it("should have default vacation allowance on initialization", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.vacationAllowance).toEqual({
        amount: 0,
        unit: "days",
        hoursPerDay: 8,
      });
    });

    it("should update vacation allowance amount", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ amount: 25 });
      });
      expect(result.current.settings.vacationAllowance.amount).toBe(25);
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
      expect(result.current.settings.vacationAllowance.hoursPerDay).toBe(8);
    });

    it("should update vacation allowance unit", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ unit: "hours" });
      });
      expect(result.current.settings.vacationAllowance.unit).toBe("hours");
      expect(result.current.settings.vacationAllowance.amount).toBe(0);
    });

    it("should update vacation allowance hoursPerDay", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ hoursPerDay: 7.5 });
      });
      expect(result.current.settings.vacationAllowance.hoursPerDay).toBe(7.5);
    });

    it("should update multiple vacation allowance properties at once", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ amount: 200, unit: "hours", hoursPerDay: 7 });
      });
      expect(result.current.settings.vacationAllowance).toEqual({
        amount: 200,
        unit: "hours",
        hoursPerDay: 7,
      });
    });

    it("should sanitize negative amount to 0", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ amount: -10 });
      });
      expect(result.current.settings.vacationAllowance.amount).toBe(0);
    });

    it("should sanitize hoursPerDay less than 1 to 1", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ hoursPerDay: 0.5 });
      });
      expect(result.current.settings.vacationAllowance.hoursPerDay).toBe(1);
    });

    it("should sanitize NaN amount to fallback value", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      // First set a valid value
      await act(async () => {
        result.current.updateVacationAllowance({ amount: 25 });
      });
      // Then try to set NaN
      await act(async () => {
        result.current.updateVacationAllowance({ amount: NaN });
      });
      // Should keep the previous valid value
      expect(result.current.settings.vacationAllowance.amount).toBe(25);
    });

    it("should sanitize Infinity amount to fallback value", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ amount: Infinity });
      });
      expect(result.current.settings.vacationAllowance.amount).toBe(0);
    });

    it("should sanitize invalid unit to fallback value", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ unit: "weeks" as any });
      });
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
    });

    it("should persist vacation allowance to localStorage", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ amount: 30, unit: "days", hoursPerDay: 8 });
      });

      const stored = window.localStorage.getItem("worktime_user_state");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.vacationAllowance).toEqual({
        amount: 30,
        unit: "days",
        hoursPerDay: 8,
      });
    });

    it("should reset vacation allowance with resetSettings", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      act(() => {
        result.current.updateVacationAllowance({ amount: 25, unit: "hours" });
        result.current.resetSettings();
      });
      expect(result.current.settings.vacationAllowance).toEqual({
        amount: 0,
        unit: "days",
        hoursPerDay: 8,
      });
    });
  });

  describe("lastUsed migration and updaters", () => {
    it("migrates last* fields from settings to lastUsed", () => {
      // Simulate old-format state with last* fields inside settings
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: 2,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "12h",
            theme: "dark",
            notifications: "on",
            vacationAllowance: { amount: 25, unit: "days", hoursPerDay: 8 },
            enableTimeOff: true,
            enableTimeTracking: false,
            timeTrackingWeeklyTargetHours: 40,
            lastActiveTab: "schedule",
            lastScheduleView: "week",
            lastTimeOffView: "stats",
            lastTimeTrackingView: "weekly",
          },
        }),
      );

      const { result } = renderHook(() => useSettings(), { wrapper });

      // Values should have been migrated to lastUsed
      expect(result.current.lastUsed.activeTab).toBe("schedule");
      expect(result.current.lastUsed.scheduleView).toBe("week");
      expect(result.current.lastUsed.timeOffView).toBe("stats");
      expect(result.current.lastUsed.timeTrackingView).toBe("weekly");
      // New fields should have defaults
      expect(result.current.lastUsed.otherSchedule).toBe(null);
      expect(result.current.lastUsed.otherTeam).toBe(null);
    });

    it("prefers lastUsed over settings when both present", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            timeTrackingWeeklyTargetHours: 40,
            lastActiveTab: "calendar",
            lastScheduleView: "today",
            lastTimeOffView: "table",
            lastTimeTrackingView: "daily",
          },
          lastUsed: {
            activeTab: "transfer",
            scheduleView: "week",
            otherSchedule: "9-5",
            timeOffView: "raw",
            timeTrackingView: "weekly",
            otherTeam: 3,
          },
        }),
      );

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.lastUsed.activeTab).toBe("transfer");
      expect(result.current.lastUsed.scheduleView).toBe("week");
      expect(result.current.lastUsed.otherSchedule).toBe("9-5");
      expect(result.current.lastUsed.timeOffView).toBe("raw");
      expect(result.current.lastUsed.timeTrackingView).toBe("weekly");
      expect(result.current.lastUsed.otherTeam).toBe(3);
    });

    it("updates lastUsed.activeTab via updateLastActiveTab", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateLastActiveTab("transfer");
      });
      expect(result.current.lastUsed.activeTab).toBe("transfer");
    });

    it("updates lastUsed.otherSchedule via updateLastOtherSchedule", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateLastOtherSchedule("9-5");
      });
      expect(result.current.lastUsed.otherSchedule).toBe("9-5");

      await act(async () => {
        result.current.updateLastOtherSchedule(null);
      });
      expect(result.current.lastUsed.otherSchedule).toBe(null);
    });

    it("updates lastUsed.otherTeam via updateLastOtherTeam", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateLastOtherTeam(3);
      });
      expect(result.current.lastUsed.otherTeam).toBe(3);

      await act(async () => {
        result.current.updateLastOtherTeam(null);
      });
      expect(result.current.lastUsed.otherTeam).toBe(null);
    });

    it("provides default lastUsed on fresh state", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.lastUsed).toEqual({
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      });
    });
  });

  describe("Atomic onboarding completion", () => {
    it("should atomically complete onboarding with vacation allowance", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      // Start with default state
      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.myTeam).toBe(null);
      expect(result.current.settings.vacationAllowance.amount).toBe(0);

      // Complete onboarding with team and vacation allowance in one atomic operation
      await act(async () => {
        result.current.completeOnboardingWithVacation(3, { amount: 35, unit: "days" });
      });

      // All values should be updated atomically
      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(result.current.myTeam).toBe(3);
      expect(result.current.settings.vacationAllowance.amount).toBe(35);
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
    });

    it("should atomically complete onboarding without team but with vacation", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      // Complete onboarding without team (browsing all teams) but with vacation allowance
      await act(async () => {
        result.current.completeOnboardingWithVacation(null, { amount: 28, unit: "hours" });
      });

      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(result.current.myTeam).toBe(null);
      expect(result.current.settings.vacationAllowance.amount).toBe(28);
      expect(result.current.settings.vacationAllowance.unit).toBe("hours");
    });

    it("should complete onboarding without vacation allowance", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      // Complete onboarding with team but skip vacation allowance
      await act(async () => {
        result.current.completeOnboardingWithVacation(2);
      });

      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(result.current.myTeam).toBe(2);
      expect(result.current.settings.vacationAllowance.amount).toBe(0);
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
    });

    it("should persist all values to localStorage atomically", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      await act(async () => {
        result.current.completeOnboardingWithVacation(4, { amount: 25.5, unit: "days" });
      });

      const stored = window.localStorage.getItem("worktime_user_state");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);

      expect(parsed.hasCompletedOnboarding).toBe(true);
      expect(parsed.myTeam).toBe(4);
      expect(parsed.settings.vacationAllowance.amount).toBe(25.5);
      expect(parsed.settings.vacationAllowance.unit).toBe("days");
    });
  });
});
