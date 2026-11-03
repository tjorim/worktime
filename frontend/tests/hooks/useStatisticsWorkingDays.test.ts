import { expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStatisticsWorkingDays } from "@/hooks/useStatisticsWorkingDays";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ myTeam: null, scheduleType: "9-5", settings: { homeCountry: "BE" } }),
}));
vi.mock("@/hooks/usePublicHolidays", () => ({
  usePublicHolidays: vi.fn((year: number) => ({
    publicHolidayMap: new Map([[`${year}/01/01`, { name: "New Year", localName: "Nieuwjaar" }]]),
  })),
}));
it("uses the home country and covers adjacent years for overnight shifts and recent weeks", () => {
  const { result } = renderHook(() => useStatisticsWorkingDays(2026));
  expect(usePublicHolidays).toHaveBeenCalledWith(2025, true, "BE");
  expect(usePublicHolidays).toHaveBeenCalledWith(2026, true, "BE");
  expect(usePublicHolidays).toHaveBeenCalledWith(2027, true, "BE");
  expect(result.current.team).toBe(1);
  expect(result.current.holidays.size).toBe(3);
});
