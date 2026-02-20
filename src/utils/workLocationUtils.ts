import type { Dayjs } from "dayjs";

import { dayjs, formatHdayDate } from "./dateTimeUtils";
import type { WorkLocationMap } from "../types/workLocation";

/**
 * Counts the number of WFH (work-from-home) days in the ISO week containing the given date.
 *
 * Only considers days present in workLocationMap with location "home".
 * Days without an explicit entry (including office defaults) are not counted.
 *
 * @param date - Any date within the target ISO week
 * @param workLocationMap - Map of explicitly set work locations keyed by YYYY/MM/DD
 * @returns The number of WFH days in that week (0-7)
 *
 * @example
 * // Returns 2 if Monday and Tuesday are set to "home" in that week
 * getWfhDaysInWeek(dayjs("2026-02-18"), workLocationMap); // 2
 */
export function getWfhDaysInWeek(date: Dayjs, workLocationMap: WorkLocationMap): number {
  const monday = dayjs(date).isoWeekday(1);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const day = monday.add(i, "day");
    const info = workLocationMap.get(formatHdayDate(day));
    if (info?.location === "home") {
      count++;
    }
  }
  return count;
}

/**
 * Counts the number of WFH (work-from-home) days in a given calendar month.
 *
 * Only considers days present in workLocationMap with location "home".
 * Days without an explicit entry (including office defaults) are not counted.
 *
 * @param year - The calendar year (e.g., 2026)
 * @param month - The calendar month, 1-indexed (1=January, 12=December)
 * @param workLocationMap - Map of explicitly set work locations keyed by YYYY/MM/DD
 * @returns The number of WFH days in that month
 *
 * @example
 * // Returns 8 if 8 days in February 2026 are set to "home"
 * getWfhDaysInMonth(2026, 2, workLocationMap); // 8
 */
export function getWfhDaysInMonth(
  year: number,
  month: number,
  workLocationMap: WorkLocationMap,
): number {
  const startOfMonth = dayjs().year(year).month(month - 1).date(1);
  const daysInMonth = startOfMonth.daysInMonth();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = startOfMonth.date(d);
    const info = workLocationMap.get(formatHdayDate(day));
    if (info?.location === "home") {
      count++;
    }
  }
  return count;
}

/**
 * Checks whether the WFH day count for the ISO week containing the given date
 * exceeds the specified limit.
 *
 * @param date - Any date within the target ISO week
 * @param workLocationMap - Map of explicitly set work locations keyed by YYYY/MM/DD
 * @param limit - Maximum number of WFH days allowed per week
 * @returns True if the WFH count strictly exceeds the limit, false otherwise
 *
 * @example
 * // Returns true if 4 WFH days are set and limit is 3
 * isWfhLimitExceeded(dayjs("2026-02-18"), workLocationMap, 3); // true
 */
export function isWfhLimitExceeded(
  date: Dayjs,
  workLocationMap: WorkLocationMap,
  limit: number,
): boolean {
  return getWfhDaysInWeek(date, workLocationMap) > limit;
}
