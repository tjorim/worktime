import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, useSettings } from "../../src/contexts/SettingsContext";
import { USER_STATE_STORAGE_KEY } from "../../src/constants/storageKeys";

describe("SettingsContext unified user state", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <SettingsProvider>{children}</SettingsProvider>;
  }

  afterEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute("data-bs-theme");
    vi.restoreAllMocks();
  });

  it("provides default values and mutators", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.settings.theme).toBe("auto");
    expect(result.current.settings.notifications).toBe("off");
    expect(result.current.settings.vacationAllowance).toEqual({
      yearlyAmounts: {},
      unit: "days",
      hoursPerDay: 8,
    });
    expect(result.current.settings.homeCountry).toBe(null);
    expect(result.current.settings.officeCountry).toBe(null);
    expect(result.current.settings.enableCrossBorderTracking).toBe(false);
    expect(result.current.settings.enableGantt).toBe(false);
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
      result.current.updateVacationAllowance({ yearlyAmounts: { "2025": 28 }, unit: "hours" });
    });
    expect(result.current.settings.vacationAllowance).toEqual({
      yearlyAmounts: { "2025": 28 },
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

    await act(async () => {
      result.current.updateGanttEnabled(true);
    });
    expect(result.current.settings.enableGantt).toBe(true);
    await act(async () => {
      result.current.updateHomeCountry("NL");
    });
    expect(result.current.settings.homeCountry).toBe("NL");
    await act(async () => {
      result.current.updateOfficeCountry("BE");
    });
    expect(result.current.settings.officeCountry).toBe("BE");
    await act(async () => {
      result.current.updateHomeCountry(null);
    });
    expect(result.current.settings.homeCountry).toBe(null);
  });

  it("updates schedule option and persists it", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      result.current.setScheduleType("5-shift");
    });

    expect(result.current.scheduleType).toBe("5-shift");

    const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
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
    window.localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ foo: "bar" }));
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
    const userStateStored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
    expect(userStateStored).not.toBeNull();
    const parsedState = JSON.parse(userStateStored || "{}");
    expect(parsedState).toEqual({
      version: 4,
      hasCompletedOnboarding: false,
      lastOnboardedVersion: 0,
      myTeam: null,
      scheduleType: null,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: {
          yearlyAmounts: {},
          unit: "days",
          hoursPerDay: 8,
        },
        enableTimeOff: false,
        enableTimeTracking: false,
        enableGantt: false,
        enableCrossBorderTracking: false,
        homeCountry: null,
        officeCountry: null,
      },
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
        ganttViewMode: "Day",
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

  describe("Cross-border tracking settings", () => {
    it("defaults enableCrossBorderTracking to false", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.enableCrossBorderTracking).toBe(false);
    });

    it("toggles enableCrossBorderTracking via updateCrossBorderTrackingEnabled", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      await act(async () => {
        result.current.updateCrossBorderTrackingEnabled(true);
      });
      expect(result.current.settings.enableCrossBorderTracking).toBe(true);

      await act(async () => {
        result.current.updateCrossBorderTrackingEnabled(false);
      });
      expect(result.current.settings.enableCrossBorderTracking).toBe(false);
    });

    it("persists enableCrossBorderTracking to localStorage", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateCrossBorderTrackingEnabled(true);
      });
      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.enableCrossBorderTracking).toBe(true);
    });
  });

  describe("Vacation Allowance Settings", () => {
    it("should have default vacation allowance on initialization", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.vacationAllowance).toEqual({
        yearlyAmounts: {},
        unit: "days",
        hoursPerDay: 8,
      });
    });

    it("should update vacation allowance yearlyAmounts", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ yearlyAmounts: { "2025": 25 } });
      });
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBe(25);
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
      expect(result.current.settings.vacationAllowance.hoursPerDay).toBe(8);
    });

    it("should update vacation allowance unit", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ unit: "hours" });
      });
      expect(result.current.settings.vacationAllowance.unit).toBe("hours");
      expect(result.current.settings.vacationAllowance.yearlyAmounts).toEqual({});
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
        result.current.updateVacationAllowance({
          yearlyAmounts: { "2025": 200 },
          unit: "hours",
          hoursPerDay: 7,
        });
      });
      expect(result.current.settings.vacationAllowance).toEqual({
        yearlyAmounts: { "2025": 200 },
        unit: "hours",
        hoursPerDay: 7,
      });
    });

    it("should skip negative values in yearlyAmounts", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ yearlyAmounts: { "2025": -10 } });
      });
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBeUndefined();
    });

    it("should sanitize hoursPerDay less than 1 to 1", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ hoursPerDay: 0.5 });
      });
      expect(result.current.settings.vacationAllowance.hoursPerDay).toBe(1);
    });

    it("should skip NaN values in yearlyAmounts", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      // First set a valid value
      await act(async () => {
        result.current.updateVacationAllowance({ yearlyAmounts: { "2025": 25 } });
      });
      // Then try to set NaN
      await act(async () => {
        result.current.updateVacationAllowance({ yearlyAmounts: { "2025": NaN } });
      });
      // Should keep the previous valid value
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBe(25);
    });

    it("should skip Infinity values in yearlyAmounts", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateVacationAllowance({ yearlyAmounts: { "2025": Infinity } });
      });
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBeUndefined();
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
        result.current.updateVacationAllowance({
          yearlyAmounts: { "2025": 30 },
          unit: "days",
          hoursPerDay: 8,
        });
      });

      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.vacationAllowance).toEqual({
        yearlyAmounts: { "2025": 30 },
        unit: "days",
        hoursPerDay: 8,
      });
    });

    it("should reset vacation allowance with resetSettings", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      act(() => {
        result.current.updateVacationAllowance({ yearlyAmounts: { "2025": 25 }, unit: "hours" });
        result.current.resetSettings();
      });
      expect(result.current.settings.vacationAllowance).toEqual({
        yearlyAmounts: {},
        unit: "days",
        hoursPerDay: 8,
      });
    });
  });

  describe("lastUsed migration and updaters", () => {
    it("migrates last* fields from settings to lastUsed", () => {
      // Simulate old-format state with last* fields inside settings
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
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
        USER_STATE_STORAGE_KEY,
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
            activeTab: "schedule",
            scheduleView: "week",
            otherSchedule: "9-5",
            timeOffView: "raw",
            timeTrackingView: "weekly",
            otherTeam: 3,
          },
        }),
      );

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.lastUsed.activeTab).toBe("schedule");
      expect(result.current.lastUsed.scheduleView).toBe("week");
      expect(result.current.lastUsed.otherSchedule).toBe("9-5");
      expect(result.current.lastUsed.timeOffView).toBe("table"); // "raw" was removed, defaults to "table"
      expect(result.current.lastUsed.timeTrackingView).toBe("weekly");
      expect(result.current.lastUsed.otherTeam).toBe(3);
    });

    it("updates lastUsed.activeTab via updateLastActiveTab", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateLastActiveTab("schedule");
      });
      expect(result.current.lastUsed.activeTab).toBe("schedule");
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

    it("updates lastUsed.ganttViewMode via updateLastGanttViewMode", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateLastGanttViewMode("Week");
      });
      expect(result.current.lastUsed.ganttViewMode).toBe("Week");

      await act(async () => {
        result.current.updateLastGanttViewMode("Month");
      });
      expect(result.current.lastUsed.ganttViewMode).toBe("Month");
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
        ganttViewMode: "Day",
      });
    });

    it("recovers with salvaged values when a migration is missing", () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          version: -1,
          myTeam: 4,
          scheduleType: "9-5",
          settings: {
            timeFormat: "12h",
            theme: "dark",
            notifications: "on",
            vacationAllowance: { amount: 20, unit: "days", hoursPerDay: 8 },
            enableTimeOff: true,
            enableTimeTracking: true,
            timeTrackingWeeklyTargetHours: 36,
          },
        }),
      );

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.myTeam).toBe(4);
      expect(result.current.scheduleType).toBe("9-5");
      expect(result.current.settings.timeFormat).toBe("12h");
      expect(result.current.settings.theme).toBe("dark");
      // Recovery resets non-salvaged values to defaults
      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.lastUsed.activeTab).toBe("calendar");
    });

    it("recovers with salvaged values when a migration throws", () => {
      const parsedState = new Proxy(
        {
          version: 0,
          myTeam: 3,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "12h",
            theme: "dark",
            notifications: "on",
            vacationAllowance: { amount: 10, unit: "days", hoursPerDay: 8 },
            enableTimeOff: true,
            enableTimeTracking: false,
            timeTrackingWeeklyTargetHours: 40,
          },
        },
        {
          get(target, prop, receiver) {
            if (prop === "lastUsed") {
              throw new Error("forced migration failure");
            }
            return Reflect.get(target, prop, receiver);
          },
        },
      );

      vi.spyOn(JSON, "parse").mockImplementation(() => parsedState as any);
      window.localStorage.setItem(USER_STATE_STORAGE_KEY, "{}");

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.myTeam).toBe(3);
      expect(result.current.scheduleType).toBe("5-shift");
      expect(result.current.settings.timeFormat).toBe("12h");
      expect(result.current.lastUsed.activeTab).toBe("calendar");
    });
  });

  describe("v1 to v2 migration (yearlyAmounts)", () => {
    it("migrates vacationAllowance.amount to yearlyAmounts[currentYear]", () => {
      const currentYear = String(new Date().getFullYear());
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          hasCompletedOnboarding: true,
          myTeam: 2,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { amount: 30, unit: "days", hoursPerDay: 8 },
            enableTimeOff: true,
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

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.settings.vacationAllowance.yearlyAmounts[currentYear]).toBe(30);
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
      expect(result.current.settings.vacationAllowance.hoursPerDay).toBe(8);
      // amount should no longer exist
      expect((result.current.settings.vacationAllowance as any).amount).toBeUndefined();
    });

    it("does not overwrite existing yearlyAmounts entry for current year", () => {
      const currentYear = String(new Date().getFullYear());
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: {
              amount: 20,
              yearlyAmounts: { [currentYear]: 35 },
              unit: "hours",
              hoursPerDay: 7.5,
            },
            enableTimeOff: true,
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

      const { result } = renderHook(() => useSettings(), { wrapper });

      // Existing entry should be preserved, not overwritten by old amount
      expect(result.current.settings.vacationAllowance.yearlyAmounts[currentYear]).toBe(35);
    });

    it("handles zero amount gracefully (does not seed yearlyAmounts)", () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
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

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.settings.vacationAllowance.yearlyAmounts).toEqual({});
    });
  });

  describe("Country preferences", () => {
    it("defaults homeCountry and officeCountry to null", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.homeCountry).toBe(null);
      expect(result.current.settings.officeCountry).toBe(null);
    });

    it("updates homeCountry with a valid code", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHomeCountry("DE");
      });
      expect(result.current.settings.homeCountry).toBe("DE");
    });

    it("updates officeCountry with a valid code", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateOfficeCountry("LU");
      });
      expect(result.current.settings.officeCountry).toBe("LU");
    });

    it("allows clearing homeCountry back to null", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHomeCountry("FR");
      });
      expect(result.current.settings.homeCountry).toBe("FR");
      await act(async () => {
        result.current.updateHomeCountry(null);
      });
      expect(result.current.settings.homeCountry).toBe(null);
    });

    it("rejects invalid homeCountry code and falls back to null", () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          hasCompletedOnboarding: false,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "XX",
            officeCountry: "INVALID",
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
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.homeCountry).toBe(null);
      expect(result.current.settings.officeCountry).toBe(null);
    });

    it("persists country changes to localStorage", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHomeCountry("GB");
        result.current.updateOfficeCountry("NL");
      });
      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.homeCountry).toBe("GB");
      expect(parsed.settings.officeCountry).toBe("NL");
    });
  });

  describe("v2 to v3 migration (country + cross-border tracking)", () => {
    const migrateFromV2 = (state: Record<string, unknown>) => {
      window.localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(state));
      return renderHook(() => useSettings(), { wrapper });
    };

    it("adds defaults and preserves existing values", () => {
      const { result } = migrateFromV2({
        version: 2,
        hasCompletedOnboarding: true,
        myTeam: 1,
        scheduleType: "5-shift",
        settings: {
          timeFormat: "24h",
          theme: "auto",
          notifications: "off",
          vacationAllowance: { yearlyAmounts: { "2025": 25 }, unit: "days", hoursPerDay: 8 },
          enableTimeOff: true,
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
      });

      expect(result.current.settings.homeCountry).toBe(null);
      expect(result.current.settings.officeCountry).toBe(null);
      expect(result.current.settings.enableCrossBorderTracking).toBe(false);
      expect(result.current.myTeam).toBe(1);
      expect(result.current.scheduleType).toBe("5-shift");
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBe(25);
    });

    it("preserves existing country values and enableCrossBorderTracking when migrating", () => {
      // Intentional: include enableCrossBorderTracking in the v2 blob to ensure
      // the migration preserves already-present values rather than resetting to defaults.
      const { result } = migrateFromV2({
        version: 2,
        hasCompletedOnboarding: true,
        myTeam: 2,
        scheduleType: "9-5",
        settings: {
          timeFormat: "12h",
          theme: "dark",
          notifications: "off",
          vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
          enableTimeOff: false,
          enableTimeTracking: false,
          homeCountry: "NL",
          officeCountry: "BE",
          enableCrossBorderTracking: true,
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

      expect(result.current.settings.homeCountry).toBe("NL");
      expect(result.current.settings.officeCountry).toBe("BE");
      expect(result.current.settings.enableCrossBorderTracking).toBe(true);
    });
  });

  describe("Atomic onboarding completion", () => {
    it("should atomically complete onboarding with vacation allowance", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      // Start with default state
      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.myTeam).toBe(null);
      expect(result.current.settings.vacationAllowance.yearlyAmounts).toEqual({});

      // Complete onboarding with team and vacation allowance in one atomic operation
      await act(async () => {
        result.current.completeOnboardingWithVacation(3, {
          yearlyAmounts: { "2025": 35 },
          unit: "days",
        });
      });

      // All values should be updated atomically
      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(result.current.myTeam).toBe(3);
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBe(35);
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
    });

    it("should atomically complete onboarding without team but with vacation", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      // Complete onboarding without team (browsing all teams) but with vacation allowance
      await act(async () => {
        result.current.completeOnboardingWithVacation(null, {
          yearlyAmounts: { "2025": 28 },
          unit: "hours",
        });
      });

      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(result.current.myTeam).toBe(null);
      expect(result.current.settings.vacationAllowance.yearlyAmounts["2025"]).toBe(28);
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
      expect(result.current.settings.vacationAllowance.yearlyAmounts).toEqual({});
      expect(result.current.settings.vacationAllowance.unit).toBe("days");
    });

    it("should persist all values to localStorage atomically", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      await act(async () => {
        result.current.completeOnboardingWithVacation(4, {
          yearlyAmounts: { "2025": 25.5 },
          unit: "days",
        });
      });

      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);

      expect(parsed.hasCompletedOnboarding).toBe(true);
      expect(parsed.myTeam).toBe(4);
      expect(parsed.settings.vacationAllowance.yearlyAmounts["2025"]).toBe(25.5);
      expect(parsed.settings.vacationAllowance.unit).toBe("days");
    });
  });
});
