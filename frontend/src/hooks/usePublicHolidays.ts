import { useMemo } from "react";
import { DEFAULT_COUNTRY } from "@/constants/holidayDefaults";
import { dayjs, formatHdayDate } from "@/utils/dateTimeUtils";
import { useOpenHolidays } from "./useOpenHolidays";

import type { PublicHolidayInfo } from "@/types/publicHolidays";
import * as m from "@/paraglide/messages.js";

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

export function usePublicHolidays(year: number, enabled: boolean = true) {
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isEnabled = enabled && isValidYear;
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
    responseErrorPrefix: m.holidays_fetch_failed(),
    timeoutError: m.holidays_timeout(),
    networkError: m.holidays_network(),
    unknownError: m.holidays_fetch_failed(),
  });

  const publicHolidayMap = useMemo(
    () => (isEnabled ? toHolidayMap(holidays) : new Map<string, PublicHolidayInfo>()),
    [holidays, isEnabled],
  );

  return { publicHolidayMap, loading, error };
}
