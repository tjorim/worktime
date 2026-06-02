import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";

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

  it("resetSettings writes the default unified user state", () => {
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
      _updatedAt: expect.any(String),
      hasCompletedOnboarding: false,
      myTeam: null,
      scheduleType: null,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
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
        ganttView: "chart",
      },
    });
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

  describe("lastUsed and updaters", () => {
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

    it("updates lastUsed.ganttView via updateLastGanttView", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateLastGanttView("table");
      });
      expect(result.current.lastUsed.ganttView).toBe("table");
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
        ganttView: "chart",
      });
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
});
