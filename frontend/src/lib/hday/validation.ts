/**
 * Date validation utilities for the .hday format (YYYY/MM/DD)
 */

import { dayjs } from "@/utils/dateTimeUtils";

const DATE_FORMAT_REGEX = /^\d{4}\/\d{2}\/\d{2}$/;

/**
 * Determine whether a string represents a valid calendar date in YYYY/MM/DD format.
 *
 * Checks that the string matches the exact YYYY/MM/DD pattern and represents a real calendar date (for example, rejects 2025/02/30).
 *
 * @param dateString - The date string to validate
 * @returns `true` if the string is a valid date in YYYY/MM/DD format, `false` otherwise.
 *
 * @example
 * isValidDate('2025/01/15') // true - valid date
 * isValidDate('2025/02/30') // false - February doesn't have 30 days
 * isValidDate('2025-01-15') // false - wrong separator
 * isValidDate('25/01/15')   // false - wrong format (must be YYYY/MM/DD)
 * isValidDate('not a date') // false - invalid format
 */
export function isValidDate(dateString: string): boolean {
  if (!DATE_FORMAT_REGEX.test(dateString)) {
    return false;
  }
  // Parse using dayjs strict mode and verify it round-trips correctly
  const parsed = dayjs(dateString, "YYYY/MM/DD", true);
  return parsed.isValid() && parsed.format("YYYY/MM/DD") === dateString;
}

/**
 * Parse a YYYY/MM/DD date string into a JavaScript Date in the local timezone.
 *
 * @param dateString - Date in `YYYY/MM/DD` format that must represent a valid calendar date
 * @returns A Date for the given day in the local timezone, or `null` if the input is not a valid date
 *
 * @example
 * parseHdayDate('2025/01/15')
 * // Returns: Date object for January 15, 2025 (00:00:00 local time)
 *
 * @example
 * parseHdayDate('2025/02/30')
 * // Returns: null (invalid date - February doesn't have 30 days)
 *
 * @example
 * parseHdayDate('invalid')
 * // Returns: null (invalid format)
 */
export function parseHdayDate(dateString: string): Date | null {
  const parsed = dayjs(dateString, "YYYY/MM/DD", true);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.toDate();
}
