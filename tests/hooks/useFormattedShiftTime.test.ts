import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "../../src/contexts/SettingsContext";
import { useFormattedShiftTime } from "../../src/hooks/useFormattedShiftTime";
import { getFormattedShiftTime } from "../../src/utils/shiftCalculations";

vi.mock("../../src/contexts/SettingsContext", () => ({
  useSettings: vi.fn(),
}));

const mockUseSettings = vi.mocked(useSettings);

const buildSettings = (timeFormat: "12h" | "24h") => ({
  settings: {
    timeFormat,
    theme: "auto",
    notifications: "off",
    vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
  },
  updateTimeFormat: vi.fn(),
  updateTheme: vi.fn(),
  updateNotifications: vi.fn(),
  updateVacationAllowance: vi.fn(),
  resetSettings: vi.fn(),
  myTeam: null,
  setMyTeam: vi.fn(),
  scheduleType: null,
  setScheduleType: vi.fn(),
  hasCompletedOnboarding: false,
  setHasCompletedOnboarding: vi.fn(),
  completeOnboardingWithTeam: vi.fn(),
  completeOnboardingWithVacation: vi.fn(),
  completeOnboardingWithSchedule: vi.fn(),
});

describe("useFormattedShiftTime", () => {
  beforeEach(() => {
    mockUseSettings.mockReset();
  });

  it("formats shift times using 24-hour settings", () => {
    mockUseSettings.mockReturnValue(buildSettings("24h"));
    const shift = { start: 7, end: 15 };

    const { result } = renderHook(() => useFormattedShiftTime(shift));

    expect(result.current).toBe(getFormattedShiftTime(shift, "24h"));
  });

  it("formats shift times using 12-hour settings", () => {
    mockUseSettings.mockReturnValue(buildSettings("12h"));
    const shift = { start: 7, end: 15 };

    const { result } = renderHook(() => useFormattedShiftTime(shift));

    expect(result.current).toBe(getFormattedShiftTime(shift, "12h"));
  });

  it("returns Not working when shift times are missing", () => {
    mockUseSettings.mockReturnValue(buildSettings("24h"));

    const { result: missingStart } = renderHook(() =>
      useFormattedShiftTime({ start: null, end: 15 }),
    );
    const { result: missingEnd } = renderHook(() =>
      useFormattedShiftTime({ start: 7, end: null }),
    );

    expect(missingStart.current).toBe("Not working");
    expect(missingEnd.current).toBe("Not working");
  });
});
