import { useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { DEFAULT_COUNTRY } from "@/constants/holidayDefaults";

/** Include adjacent years for ISO weeks, recent weeks and overnight holiday shifts. */
export function useStatisticsWorkingDays(year: number) {
  const { myTeam, scheduleType, settings } = useSettings();
  const country = settings.homeCountry ?? DEFAULT_COUNTRY;
  const previous = usePublicHolidays(year - 1, true, country);
  const current = usePublicHolidays(year, true, country);
  const next = usePublicHolidays(year + 1, true, country);
  return useMemo(
    () => ({
      team: getEffectiveTeam(myTeam, scheduleType),
      schedule: scheduleType,
      holidays: new Map([
        ...previous.publicHolidayMap,
        ...current.publicHolidayMap,
        ...next.publicHolidayMap,
      ]),
    }),
    [
      myTeam,
      scheduleType,
      previous.publicHolidayMap,
      current.publicHolidayMap,
      next.publicHolidayMap,
    ],
  );
}
