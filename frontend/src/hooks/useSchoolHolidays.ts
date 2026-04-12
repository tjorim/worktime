import { useMemo } from "react";
import { DEFAULT_COUNTRY } from "@/constants/holidayDefaults";
import { dayjs, formatHdayDate } from "@/utils/dateTimeUtils";
import { useOpenHolidays } from "./useOpenHolidays";

import type { SchoolHolidayInfo } from "@/types/schoolHolidays";

export interface SchoolHolidayName {
  language: string;
  text: string;
}

export interface SchoolHolidaySubdivision {
  code: string;
  shortName?: string;
}

export interface SchoolHoliday {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  name: SchoolHolidayName[];
  regionalScope: string;
  temporalScope: string;
  nationwide: boolean;
  subdivisions: SchoolHolidaySubdivision[];
}

const DEFAULT_LANGUAGE = "EN";
const NATIVE_LANGUAGE = "NL"; // Dutch is the native language for Netherlands

export function getSchoolHolidayName(holiday: SchoolHoliday, language: string = DEFAULT_LANGUAGE) {
  const match = holiday.name.find((entry) => entry.language === language);
  if (match?.text) {
    return match.text;
  }
  return holiday.name[0]?.text ?? "School Holiday";
}

const toSchoolHolidayMap = (
  holidays: SchoolHoliday[],
  language: string,
  nativeLanguage: string,
) => {
  const map = new Map<string, SchoolHolidayInfo>();

  holidays.forEach((holiday) => {
    const start = dayjs(holiday.startDate);
    const end = dayjs(holiday.endDate);
    const name = getSchoolHolidayName(holiday, language);
    // Extract the local/native language name (e.g., "NL" for Netherlands = Dutch)
    const localName = getSchoolHolidayName(holiday, nativeLanguage);

    let current = start;
    while (current.isSameOrBefore(end, "day")) {
      map.set(formatHdayDate(current), { name, localName });
      current = current.add(1, "day");
    }
  });

  return map;
};

export function useSchoolHolidays(year: number, enabled: boolean = true) {
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

  const { holidays, loading, error } = useOpenHolidays<SchoolHoliday>({
    endpoint: "school",
    params,
    enabled: isEnabled,
    responseErrorPrefix: "Failed to fetch school holidays",
    timeoutError: "Request timeout: Unable to reach school holiday API",
    networkError: "Network error: Unable to connect to school holiday API",
    unknownError: "Failed to fetch school holidays",
  });

  const schoolHolidayMap = useMemo(
    () =>
      isEnabled
        ? toSchoolHolidayMap(holidays, DEFAULT_LANGUAGE, NATIVE_LANGUAGE)
        : new Map<string, SchoolHolidayInfo>(),
    [holidays, isEnabled],
  );

  return { schoolHolidayMap, loading, error };
}
