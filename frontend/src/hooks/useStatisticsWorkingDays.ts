import { useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { DEFAULT_COUNTRY } from "@/constants/holidayDefaults";

export type HolidayStatus = "loading" | "error" | "ready";

/** Include adjacent years for ISO weeks, recent weeks and overnight holiday shifts. */
export function useStatisticsWorkingDays(year: number) {
  const { myTeam, scheduleType, settings } = useSettings();
  const country = settings.homeCountry ?? DEFAULT_COUNTRY;
  const previous = usePublicHolidays(year - 1, true, country);
  const current = usePublicHolidays(year, true, country);
  const next = usePublicHolidays(year + 1, true, country);
  const hasError = Boolean(previous.error || current.error || next.error);
  const isLoading = previous.loading || current.loading || next.loading;
  return useMemo(
    () => ({
      team: getEffectiveTeam(myTeam, scheduleType),
      schedule: scheduleType,
      // Only nationwide holidays: no region setting exists, so regional ones
      // would wrongly reduce everybody's target in that country.
      holidays: new Map([
        ...previous.nationwideHolidayMap,
        ...current.nationwideHolidayMap,
        ...next.nationwideHolidayMap,
      ]),
      holidayStatus: (hasError ? "error" : isLoading ? "loading" : "ready") as HolidayStatus,
    }),
    [
      myTeam,
      scheduleType,
      previous.nationwideHolidayMap,
      current.nationwideHolidayMap,
      next.nationwideHolidayMap,
      hasError,
      isLoading,
    ],
  );
}
