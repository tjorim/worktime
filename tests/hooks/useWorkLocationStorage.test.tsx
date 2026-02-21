import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { useWorkLocationStorage } from "../../src/hooks/useWorkLocationStorage";

/**
 * Writes a v3 user-state to localStorage so that SettingsProvider initialises
 * with the given homeCountry / officeCountry values, then returns a wrapper
 * component that provides the SettingsContext to the hook under test.
 */
function makeWrapper(homeCountry: string | null = "NL", officeCountry: string | null = "BE") {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      version: 3,
      hasCompletedOnboarding: true,
      myTeam: 1,
      scheduleType: "5-shift",
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
        enableTimeOff: false,
        enableTimeTracking: false,
        homeCountry,
        officeCountry,
        enableCrossBorderTracking: false,
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
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SettingsProvider>{children}</SettingsProvider>;
  };
}

describe("useWorkLocationStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("starts with an empty workLocationMap", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper(),
    });
    expect(result.current.workLocationMap.size).toBe(0);
  });

  it("stores a WFH day and reflects it in workLocationMap", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setLocationForDate("2026-02-18", "home");
    });

    expect(result.current.workLocationMap.get("2026-02-18")).toEqual({
      location: "home",
      countryCode: "NL",
    });
  });

  it("stores an office day with the officeCountry code", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setLocationForDate("2026-02-18", "office");
    });

    expect(result.current.workLocationMap.get("2026-02-18")).toEqual({
      location: "office",
      countryCode: "BE",
    });
  });

  it("clears a stored location so the map no longer contains the key", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setLocationForDate("2026-02-18", "home");
    });
    expect(result.current.workLocationMap.has("2026-02-18")).toBe(true);

    act(() => {
      result.current.clearLocationForDate("2026-02-18");
    });
    expect(result.current.workLocationMap.has("2026-02-18")).toBe(false);
  });

  it("returns false and does not store when homeCountry is null", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper(null, "BE"),
    });

    let success!: boolean;
    act(() => {
      success = result.current.setLocationForDate("2026-02-18", "home");
    });

    expect(success).toBe(false);
    expect(result.current.workLocationMap.has("2026-02-18")).toBe(false);
  });

  it("returns false and does not store when officeCountry is null", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper("NL", null),
    });

    let success!: boolean;
    act(() => {
      success = result.current.setLocationForDate("2026-02-18", "office");
    });

    expect(success).toBe(false);
    expect(result.current.workLocationMap.has("2026-02-18")).toBe(false);
  });

  it("returns true when the location is stored successfully", () => {
    const { result } = renderHook(() => useWorkLocationStorage(2026), {
      wrapper: makeWrapper(),
    });

    let success!: boolean;
    act(() => {
      success = result.current.setLocationForDate("2026-02-18", "home");
    });

    expect(success).toBe(true);
  });

  describe("getLocationForDate", () => {
    it("falls back to office with officeCountry when no explicit entry exists", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper("NL", "BE"),
      });

      expect(result.current.getLocationForDate("2026-02-18")).toEqual({
        location: "office",
        countryCode: "BE",
      });
    });

    it("returns null when no explicit entry and officeCountry is not configured", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper("NL", null),
      });

      expect(result.current.getLocationForDate("2026-02-18")).toBeNull();
    });

    it("returns the explicit stored location, overriding the office default", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setLocationForDate("2026-02-18", "home");
      });

      expect(result.current.getLocationForDate("2026-02-18")).toEqual({
        location: "home",
        countryCode: "NL",
      });
    });
  });

  describe('"other" location type', () => {
    it("stores an other-location entry with the supplied countryCode and label", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setLocationForDate("2026-02-18", "other", {
          countryCode: "DE",
          label: "Berlin office",
        });
      });

      expect(result.current.workLocationMap.get("2026-02-18")).toEqual({
        location: "other",
        countryCode: "DE",
        label: "Berlin office",
      });
    });

    it("stores an other-location entry without a label when label is omitted", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setLocationForDate("2026-02-18", "other", { countryCode: "FR" });
      });

      const entry = result.current.workLocationMap.get("2026-02-18");
      expect(entry?.location).toBe("other");
      expect(entry?.countryCode).toBe("FR");
      expect(entry?.label).toBeUndefined();
    });

    it("returns false and does not store when countryCode is missing for other", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      let success!: boolean;
      act(() => {
        success = result.current.setLocationForDate("2026-02-18", "other");
      });

      expect(success).toBe(false);
      expect(result.current.workLocationMap.has("2026-02-18")).toBe(false);
    });

    it("returns false and does not store when countryCode is not a valid ISO alpha-2", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      let success!: boolean;
      act(() => {
        success = result.current.setLocationForDate("2026-02-18", "other", {
          countryCode: "DEU", // 3 letters — invalid
        });
      });

      expect(success).toBe(false);
      expect(result.current.workLocationMap.has("2026-02-18")).toBe(false);
    });

    it("historical entry preserves its countryCode after remount with changed settings", () => {
      // Write an "other" entry with DE
      const { result, unmount } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper("NL", "BE"),
      });

      act(() => {
        result.current.setLocationForDate("2026-02-18", "other", { countryCode: "DE" });
      });

      // Simulate settings change by remounting with a new SettingsProvider state.
      // (renderHook.rerender does not replace wrapper/context providers.)
      unmount();
      const { result: remounted } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper("FR", "DE"),
      });

      // The stored entry must still carry DE, unaffected by settings
      expect(remounted.current.workLocationMap.get("2026-02-18")).toEqual({
        location: "other",
        countryCode: "DE",
      });
    });
  });

  describe("year-boundary handling", () => {
    it("stores a date from the previous year in its own localStorage key", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      let success!: boolean;
      act(() => {
        success = result.current.setLocationForDate("2025-12-31", "home");
      });

      expect(success).toBe(true);
      expect(result.current.workLocationMap.get("2025-12-31")).toEqual({
        location: "home",
        countryCode: "NL",
      });
      expect(window.localStorage.getItem("worktime_work_locations_2025")).not.toBeNull();
    });

    it("stores a date from the next year in its own localStorage key", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      let success!: boolean;
      act(() => {
        success = result.current.setLocationForDate("2027-01-01", "office");
      });

      expect(success).toBe(true);
      expect(result.current.workLocationMap.get("2027-01-01")).toEqual({
        location: "office",
        countryCode: "BE",
      });
      expect(window.localStorage.getItem("worktime_work_locations_2027")).not.toBeNull();
    });

    it("returns false for a date more than one year outside the current year", () => {
      const { result } = renderHook(() => useWorkLocationStorage(2026), {
        wrapper: makeWrapper(),
      });

      let success!: boolean;
      act(() => {
        success = result.current.setLocationForDate("2024-01-01", "home");
      });

      expect(success).toBe(false);
      expect(result.current.workLocationMap.has("2024-01-01")).toBe(false);
    });
  });
});
