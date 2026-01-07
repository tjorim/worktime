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
  });

  it("validates and falls back to default state if corrupted", () => {
    // Simulate corrupted state in localStorage
    window.localStorage.setItem("worktime_user_state", JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.myTeam).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.settings.timeFormat).toBe("24h");
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
      hasCompletedOnboarding: false,
      myTeam: null,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: {
          amount: 0,
          unit: "days",
          hoursPerDay: 8,
        },
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
});
