import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import isoWeeksInYear from "dayjs/plugin/isoWeeksInYear";
import isLeapYear from "dayjs/plugin/isLeapYear";
import "dayjs/locale/en-gb";

// Configure dayjs with plugins and locale
dayjs.extend(isoWeek);
dayjs.extend(isLeapYear);
dayjs.extend(isoWeeksInYear);
dayjs.locale("en-gb");

// Export the configured dayjs instance
export { dayjs };

// Common date utility functions used across the app
export const addDays = (date: Date, days: number): Date => {
  return dayjs(date).add(days, "day").toDate();
};

export const formatISODate = (date: Date): string => {
  return dayjs(date).format("YYYY-MM-DD");
};

export const formatDisplayDate = (date: Date): string => {
  return dayjs(date).format("ddd, MMM D");
};

/**
 * Returns the 2-digit ISO week year (e.g., "25" for 2025)
 * @param date - The date to extract the year from
 * @returns The 2-digit ISO week year
 *
 * @example
 * getISOWeekYear2Digit('2025-05-13') // "25"
 * getISOWeekYear2Digit('2024-12-30') // "25" (ISO week year can differ from calendar year at year boundaries)
 */
export const getISOWeekYear2Digit = (date: string | Date | dayjs.Dayjs): string => {
  return dayjs(date).isoWeekYear().toString().slice(-2);
};

/**
 * Returns the 2-digit ISO week number (e.g., "20" for the 20th week)
 * @param date - The date to extract the week number from
 * @returns The 2-digit ISO week number
 *
 * @example
 * getISOWeek2Digit('2025-05-13') // "20" (week 20 of 2025)
 * getISOWeek2Digit('2025-01-06') // "02" (padded with zero)
 */
export const getISOWeek2Digit = (date: string | Date | dayjs.Dayjs): string => {
  return dayjs(date).isoWeek().toString().padStart(2, "0");
};

/**
 * Returns the ISO weekday (1-7) for the date, where 1 is Monday and 7 is Sunday
 * @param date - The date to extract the weekday from
 * @returns The ISO weekday number
 *
 * @example
 * getISOWeekday('2025-05-12') // 1 (Monday)
 * getISOWeekday('2025-05-13') // 2 (Tuesday)
 * getISOWeekday('2025-05-18') // 7 (Sunday)
 */
export const getISOWeekday = (date: string | Date | dayjs.Dayjs): number => {
  return dayjs(date).isoWeekday();
};

/**
 * Format a date as YYYY/MM/DD for .hday-style date strings.
 */
export const formatHdayDate = (date: string | Date | dayjs.Dayjs): string => {
  return dayjs(date).format("YYYY/MM/DD");
};

/**
 * Pad a number to two digits with leading zeros.
 *
 * @param value - A non-negative integer in the range 0-99
 * @returns The value as a zero-padded 2-character string
 *
 * @example
 * pad2(5)  // "05"
 * pad2(15) // "15"
 * pad2(0)  // "00"
 *
 * @remarks
 * - Values >= 100 are not padded (e.g., 150 → "150")
 * - Negative numbers preserve the sign (e.g., -5 → "-5")
 * - Non-integers are converted to strings as-is (e.g., 3.5 → "3.5")
 * - For date/time formatting, ensure input is a valid integer 0-99
 */
export const pad2 = (value: number): string => {
  return value.toString().padStart(2, "0");
};

/**
 * Formats a date into the YYWW.D format using ISO week numbering
 * Note: Year is represented as 2 digits (00-99), valid for years 2000-2099
 * Uses ISO week numbering, where weeks start on Monday and end on Sunday
 * @param date - The date to format
 * @returns The formatted date code (e.g., "2520.2")
 *
 * @example
 * formatYYWWD('2025-05-13') // "2520.2" (2025, week 20, Tuesday)
 * formatYYWWD('2025-01-06') // "2502.1" (2025, week 02, Monday)
 * formatYYWWD('2024-12-30') // "2501.1" (ISO week 1 of 2025, Monday)
 *
 * @see getShiftCode For combining this with shift types to create full shift codes
 */
export const formatYYWWD = (date: string | Date | dayjs.Dayjs): string => {
  const year = getISOWeekYear2Digit(date);
  const week = getISOWeek2Digit(date);
  const day = getISOWeekday(date);
  return `${year}${week}.${day}`;
};

/**
 * Format a Dayjs object into a time string using the specified 12h or 24h preference.
 *
 * @param dayjsObj - The Dayjs object to format
 * @param timeFormat - "12h" produces `hh:mm A` (e.g. `07:30 PM`); "24h" produces `HH:mm` (e.g. `19:30`)
 * @returns The formatted time string
 *
 * @example
 * const time = dayjs('2025-05-13 19:30');
 * formatTimeByPreference(time, '12h') // "07:30 PM"
 * formatTimeByPreference(time, '24h') // "19:30"
 */
export function formatTimeByPreference(dayjsObj: dayjs.Dayjs, timeFormat: "12h" | "24h"): string {
  return dayjsObj.format(timeFormat === "12h" ? "hh:mm A" : "HH:mm");
}

/**
 * Produce a localized time representation for a shift start, end, or range.
 *
 * Formats times according to `timeFormat`. When both `start` and `end` are provided returns a range joined with an en dash (e.g. "07:00–15:00" or "7:00 AM–3:00 PM"). If only one is provided returns that time. Special-case: an `end` value of `0` or a computed time of `24:00` is rendered as "24:00" for `24h` or "12:00 AM" for `12h`.
 *
 * @param start - Start hour (0–23) or `null`
 * @param end - End hour (0–23) or `null`
 * @param timeFormat - Either `"12h"` or `"24h"` to control formatting style
 * @returns The formatted time string or `null` if neither `start` nor `end` is provided
 */
/**
 * Splits a fractional hour value into hours and minutes components.
 *
 * @param hourValue - A fractional hour value (e.g., 6.5 for 06:30, 14.5 for 14:30)
 * @returns An object with `hours` (integer 0-24) and `minutes` (integer 0-59)
 *
 * @example
 * splitFractionalHour(6.5)   // { hours: 6, minutes: 30 }
 * splitFractionalHour(14.25) // { hours: 14, minutes: 15 }
 * splitFractionalHour(7)     // { hours: 7, minutes: 0 }
 */
export const splitFractionalHour = (hourValue: number): { hours: number; minutes: number } => {
  const wholeHours = Math.floor(hourValue);
  const minutes = Math.round((hourValue - wholeHours) * 60);
  const adjustedHours = minutes === 60 ? wholeHours + 1 : wholeHours;
  const adjustedMinutes = minutes === 60 ? 0 : minutes;
  return { hours: adjustedHours, minutes: adjustedMinutes };
};

/**
 * Creates a dayjs object with the time set from a fractional hour value.
 *
 * This correctly handles fractional hours like 6.5 (06:30) or 14.5 (14:30)
 * by splitting the value into hours and minutes instead of truncating.
 *
 * @param date - The base dayjs date to set the time on
 * @param fractionalHour - A fractional hour value (e.g., 6.5 for 06:30)
 * @returns A new dayjs object with the time set from the fractional hour
 *
 * @example
 * setTimeFromFractionalHour(dayjs(), 6.5)  // Sets time to 06:30:00
 * setTimeFromFractionalHour(dayjs(), 14.5) // Sets time to 14:30:00
 * setTimeFromFractionalHour(dayjs(), 7)    // Sets time to 07:00:00
 */
export const setTimeFromFractionalHour = (
  date: dayjs.Dayjs,
  fractionalHour: number,
): dayjs.Dayjs => {
  const { hours, minutes } = splitFractionalHour(fractionalHour);
  return date.hour(hours).minute(minutes).second(0);
};

export function getLocalizedShiftTime(
  start: number | null,
  end: number | null,
  timeFormat: "12h" | "24h",
): string | null {
  if (start == null && end == null) return null;
  const formatMidnight = () => (timeFormat === "24h" ? "24:00" : "12:00 AM");
  const format = (hour: number) => {
    const { hours, minutes } = splitFractionalHour(hour);
    if (hours === 24 && minutes === 0) {
      return formatMidnight();
    }
    return formatTimeByPreference(dayjs().hour(hours).minute(minutes).second(0), timeFormat);
  };
  if (start != null && end != null) {
    const startTime = format(start);
    const endTime = end === 0 ? formatMidnight() : format(end);
    return `${startTime}–${endTime}`;
  }
  if (start != null) return format(start);
  if (end != null) return end === 0 ? formatMidnight() : format(end);
  return null;
}

/**
 * Weekday names mapping (ISO 8601: 1=Monday, 7=Sunday)
 */
const WEEKDAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/**
 * Returns the short weekday name for an ISO weekday number
 * @param isoWeekday - ISO weekday number (1=Monday, 7=Sunday)
 * @returns The short weekday name (e.g., "Mon", "Tue")
 * @throws {RangeError} If isoWeekday is not in range 1-7
 */
export const getWeekdayName = (isoWeekday: number): string => {
  if (isoWeekday < 1 || isoWeekday > 7) {
    throw new RangeError(`Invalid ISO weekday: ${isoWeekday}. Expected 1-7.`);
  }
  return WEEKDAY_NAMES[isoWeekday]!;
};
