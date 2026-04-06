import { useMemo } from "react";
import { dayjs, formatHdayDate } from "@/utils/dateTimeUtils";
import { useOpenHolidays } from "./useOpenHolidays";

import type { PublicHolidayInfo } from "@/types/publicHolidays";

export interface PublicHolidayName {
  language: string;
  text: string;
}

export interface PublicHoliday {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  name: PublicHolidayName[];
  regionalScope: string;
  temporalScope: string;
  nationwide: boolean;
}

const DEFAULT_LANGUAGE = "EN";
const DEFAULT_COUNTRY = "NL";
const NATIVE_LANGUAGE = "NL"; // Dutch is the native language for Netherlands

export function getPublicHolidayName(holiday: PublicHoliday, language: string = DEFAULT_LANGUAGE) {
  const match = holiday.name.find((entry) => entry.language === language);
  if (match?.text) {
    return match.text;
  }
  return holiday.name[0]?.text ?? "Public Holiday";
}

const toHolidayMap = (holidays: PublicHoliday[], language: string, nativeLanguage: string) => {
  const map = new Map<string, PublicHolidayInfo>();

  holidays.forEach((holiday) => {
    const start = dayjs(holiday.startDate);
    const end = dayjs(holiday.endDate);
    const name = getPublicHolidayName(holiday, language);
    // Extract the local/native language name (e.g., "NL" for Netherlands = Dutch)
    const localName = getPublicHolidayName(holiday, nativeLanguage);

    let current = start;
    while (current.isSameOrBefore(end, "day")) {
      map.set(formatHdayDate(current), { name, localName });
      current = current.add(1, "day");
    }
  });

  return map;
};

export function usePublicHolidays(
  year: number,
  countryCode: string = DEFAULT_COUNTRY,
  language: string = DEFAULT_LANGUAGE,
  enabled: boolean = true,
) {
  const isTestEnv = import.meta.env.MODE === "test";
  const isValidYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const isEnabled = enabled && !isTestEnv && Boolean(countryCode) && isValidYear;
  const params = useMemo(
    () => ({
      countryIsoCode: countryCode,
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      languageIsoCode: language,
    }),
    [countryCode, year, language],
  );

  const { holidays, loading, error } = useOpenHolidays<PublicHoliday>({
    endpoint: "PublicHolidays",
    params,
    enabled: isEnabled,
    responseErrorPrefix: "Failed to fetch holidays",
    timeoutError: "Request timeout: Unable to reach holiday API",
    networkError: "Network error: Unable to connect to holiday API",
    unknownError: "Failed to fetch holidays",
  });

  const publicHolidayMap = useMemo(
    () =>
      isEnabled
        ? toHolidayMap(holidays, language, NATIVE_LANGUAGE)
        : new Map<string, PublicHolidayInfo>(),
    [holidays, isEnabled, language],
  );

  return { publicHolidayMap, loading, error };
}
