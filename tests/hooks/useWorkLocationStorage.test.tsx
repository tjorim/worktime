import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { useWorkLocationStorage } from "../../src/hooks/useWorkLocationStorage";
import { dayjs } from "../../src/utils/dateTimeUtils";

describe("useWorkLocationStorage", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <SettingsProvider>{children}</SettingsProvider>;
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  describe("workLocationMap", () => {
    it("should return an empty Map when no locations are stored", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      expect(result.current.workLocationMap.size).toBe(0);
    });

    it("should convert stored locations to a Map", () => {
      // Pre-populate localStorage
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
          "2026/02/19": { location: "office", countryCode: "BE" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      expect(result.current.workLocationMap.size).toBe(2);
      expect(result.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "home",
        countryCode: "NL",
      });
      expect(result.current.workLocationMap.get("2026/02/19")).toEqual({
        location: "office",
        countryCode: "BE",
      });
    });
  });

  describe("getLocationForDate", () => {
    it("should return null when no location is stored and no officeCountry is set", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const location = result.current.getLocationForDate("2026/02/18");
      expect(location).toBeNull();
    });

    it("should return stored location for a date", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const location = result.current.getLocationForDate("2026/02/18");

      expect(location).toEqual({ location: "home", countryCode: "NL" });
    });

    it("should fall back to office default when no explicit location is set", () => {
      // Set officeCountry in settings
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const location = result.current.getLocationForDate("2026/02/18");

      expect(location).toEqual({ location: "office", countryCode: "BE" });
    });

    it("should accept dayjs objects as date parameter", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "DE" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const date = dayjs("2026-02-18");
      const location = result.current.getLocationForDate(date);

      expect(location).toEqual({ location: "home", countryCode: "DE" });
    });

    it("should accept Date objects as date parameter", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "office", countryCode: "LU" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const date = new Date("2026-02-18");
      const location = result.current.getLocationForDate(date);

      expect(location).toEqual({ location: "office", countryCode: "LU" });
    });

    it("should prefer explicit stored location over office default", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const location = result.current.getLocationForDate("2026/02/18");

      expect(location).toEqual({ location: "home", countryCode: "NL" });
    });
  });

  describe("setLocationForDate", () => {
    it("should store a home location with homeCountry", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.setLocationForDate("2026/02/18", "home");
      });

      expect(result.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "home",
        countryCode: "NL",
      });
    });

    it("should store an office location with officeCountry", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.setLocationForDate("2026/02/18", "office");
      });

      expect(result.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "office",
        countryCode: "BE",
      });
    });

    it("should be a no-op when homeCountry is not set for home location", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: null,
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.setLocationForDate("2026/02/18", "home");
      });

      expect(result.current.workLocationMap.size).toBe(0);
    });

    it("should be a no-op when officeCountry is not set for office location", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: null,
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.setLocationForDate("2026/02/18", "office");
      });

      expect(result.current.workLocationMap.size).toBe(0);
    });

    it("should accept dayjs objects as date parameter", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "DE",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const date = dayjs("2026-02-18");

      act(() => {
        result.current.setLocationForDate(date, "home");
      });

      expect(result.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "home",
        countryCode: "DE",
      });
    });

    it("should accept Date objects as date parameter", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "FR",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const date = new Date("2026-02-18");

      act(() => {
        result.current.setLocationForDate(date, "home");
      });

      expect(result.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "home",
        countryCode: "FR",
      });
    });

    it("should update an existing location", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.setLocationForDate("2026/02/18", "office");
      });

      expect(result.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "office",
        countryCode: "BE",
      });
    });

    it("should persist to localStorage", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "GB",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.setLocationForDate("2026/02/18", "home");
      });

      const stored = window.localStorage.getItem("worktime_work_locations_2026");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed["2026/02/18"]).toEqual({ location: "home", countryCode: "GB" });
    });
  });

  describe("clearLocationForDate", () => {
    it("should remove a stored location", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
          "2026/02/19": { location: "office", countryCode: "BE" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      expect(result.current.workLocationMap.size).toBe(2);

      act(() => {
        result.current.clearLocationForDate("2026/02/18");
      });

      expect(result.current.workLocationMap.size).toBe(1);
      expect(result.current.workLocationMap.has("2026/02/18")).toBe(false);
      expect(result.current.workLocationMap.has("2026/02/19")).toBe(true);
    });

    it("should be a no-op when clearing a non-existent location", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/19": { location: "office", countryCode: "BE" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      expect(result.current.workLocationMap.size).toBe(1);

      act(() => {
        result.current.clearLocationForDate("2026/02/18");
      });

      expect(result.current.workLocationMap.size).toBe(1);
    });

    it("should accept dayjs objects as date parameter", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const date = dayjs("2026-02-18");

      act(() => {
        result.current.clearLocationForDate(date);
      });

      expect(result.current.workLocationMap.size).toBe(0);
    });

    it("should accept Date objects as date parameter", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });
      const date = new Date("2026-02-18");

      act(() => {
        result.current.clearLocationForDate(date);
      });

      expect(result.current.workLocationMap.size).toBe(0);
    });

    it("should persist removal to localStorage", () => {
      window.localStorage.setItem(
        "worktime_work_locations_2026",
        JSON.stringify({
          "2026/02/18": { location: "home", countryCode: "NL" },
          "2026/02/19": { location: "office", countryCode: "BE" },
        }),
      );

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result.current.clearLocationForDate("2026/02/18");
      });

      const stored = window.localStorage.getItem("worktime_work_locations_2026");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed["2026/02/18"]).toBeUndefined();
      expect(parsed["2026/02/19"]).toEqual({ location: "office", countryCode: "BE" });
    });
  });

  describe("year isolation", () => {
    it("should store locations for different years separately", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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

      const { result: result2025 } = renderHook(() => useWorkLocationStorage(2025), { wrapper });
      const { result: result2026 } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      act(() => {
        result2025.current.setLocationForDate("2025/02/18", "home");
        result2026.current.setLocationForDate("2026/02/18", "office");
      });

      expect(result2025.current.workLocationMap.get("2025/02/18")).toEqual({
        location: "home",
        countryCode: "NL",
      });
      expect(result2026.current.workLocationMap.get("2026/02/18")).toEqual({
        location: "office",
        countryCode: "BE",
      });

      // Verify separate localStorage keys
      const stored2025 = window.localStorage.getItem("worktime_work_locations_2025");
      const stored2026 = window.localStorage.getItem("worktime_work_locations_2026");

      expect(stored2025).not.toBeNull();
      expect(stored2026).not.toBeNull();
      expect(JSON.parse(stored2025!)["2025/02/18"]).toBeDefined();
      expect(JSON.parse(stored2026!)["2026/02/18"]).toBeDefined();
    });
  });

  describe("integration scenarios", () => {
    it("should handle a complete workflow: set, get, update, clear", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
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

      const { result } = renderHook(() => useWorkLocationStorage(2026), { wrapper });

      // Set home location
      act(() => {
        result.current.setLocationForDate("2026/02/18", "home");
      });

      let location = result.current.getLocationForDate("2026/02/18");
      expect(location).toEqual({ location: "home", countryCode: "NL" });

      // Update to office location
      act(() => {
        result.current.setLocationForDate("2026/02/18", "office");
      });

      location = result.current.getLocationForDate("2026/02/18");
      expect(location).toEqual({ location: "office", countryCode: "BE" });

      // Clear location
      act(() => {
        result.current.clearLocationForDate("2026/02/18");
      });

      location = result.current.getLocationForDate("2026/02/18");
      // Should fall back to office default
      expect(location).toEqual({ location: "office", countryCode: "BE" });
      // But should not be in the explicit map
      expect(result.current.workLocationMap.has("2026/02/18")).toBe(false);
    });
  });
});