import { useMemo } from "react";
import { DEFAULT_COUNTRY } from "@/constants/holidayDefaults";
import { dayjs, formatHdayDate } from "@/utils/dateTimeUtils";
import { useOpenHolidays } from "./useOpenHolidays";

import type { PublicHolidayInfo } from "@/types/publicHolidays";

export interface PublicHoliday {
  date: string;
  name: string;
  localName: string;
  global: boolean;
  counties: string[] | null;
  types: string[];
}

const toHolidayMap = (holidays: PublicHoliday[]) => {
  const map = new Map<string, PublicHolidayInfo>();

  holidays.forEach((holiday) => {
    map.set(formatHdayDate(dayjs(holiday.date)), {
      name: holiday.name,
      localName: holiday.localName,
    });
  });

  return map;
};

export function usePublicHolidays(
  year: number,
  enabled: boolean = true,
) {
  const isTestEnv = import.meta.env.MODE === "test";
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isEnabled = enabled && !isTestEnv && isValidYear;
  const params = useMemo(
    () => ({
      country: DEFAULT_COUNTRY,
      year: String(year),
    }),
    [year],
  );

  const { holidays, loading, error } = useOpenHolidays<PublicHoliday>({
    endpoint: "public",
    params,
    enabled: isEnabled,
    responseErrorPrefix: "Failed to fetch holidays",
    timeoutError: "Request timeout: Unable to reach holiday API",
    networkError: "Network error: Unable to connect to holiday API",
    unknownError: "Failed to fetch holidays",
  });

  const publicHolidayMap = useMemo(
    () => (isEnabled ? toHolidayMap(holidays) : new Map<string, PublicHolidayInfo>()),
    [holidays, isEnabled],
  );

  return { publicHolidayMap, loading, error };
}
