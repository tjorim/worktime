/**
 * Working Day Calculation Utilities
 *
 * Determines whether specific days are working days for a user based on:
 * 1. Their roster schedule (shift pattern)
 * 2. Time-off events (holidays, sick leave, etc.)
 * 3. Public holidays with shift-specific logic
 *
 * ## Public Holiday Logic for Shifts
 *
 * For shift workers, whether a public holiday is a day off depends on when
 * the majority of working hours fall:
 *
 * - **Day shifts (D)**: Holiday on that day = day off
 * - **Morning/Early shifts (M)**: Holiday on that day = day off
 * - **Evening/Late shifts (L)**: Holiday on that day = day off
 * - **Night shifts (N)**: Holiday affects the PREVIOUS day
 *   - Night shift runs 23:00-07:00 (8 hours)
 *   - 7 out of 8 hours fall on the holiday date
 *   - So if May 5 is a holiday, night shift starting May 4 at 23:00 is OFF
 *
 * @module utils/workingDayUtils
 */

import type { Dayjs } from "dayjs";
import type { ScheduleOption } from "../data/rosters";
import type { PublicHolidayInfo } from "../types/publicHolidays";
import type { TimeOffEntry } from "../lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "../lib/timeOff/types";
import { calculateShift } from "./shiftCalculations";
import { dayjs, formatHdayDate } from "./dateTimeUtils";

/**
 * Checks if a date matches any time-off event.
 *
 * @param date - The date to check
 * @param entries - Array of time-off entries
 * @returns True if the date has a time-off event, false otherwise
 */
export function hasTimeOffEvent(date: Dayjs, entries: TimeOffEntry[]): boolean {
  const targetDate = date.format("YYYY-MM-DD");
  return entries.some((entry) =>
    isTimeOffDateEntry(entry)
      ? entry.date === targetDate
      : isTimeOffRangeEntry(entry)
        ? date.isSameOrAfter(dayjs(entry.start).startOf("day"), "day") &&
          date.isSameOrBefore(dayjs(entry.end).startOf("day"), "day")
      : isTimeOffWeeklyEntry(entry)
        ? date.isoWeekday() === entry.weekday
        : false,
  );
}

/**
 * Checks if a date is a public holiday for a specific team and shift.
 *
 * For night shifts (N), checks if the NEXT day is a public holiday,
 * since 7 out of 8 hours of the night shift fall on the next day.
 * Night shifts run 23:00-07:00 (8 hours total):
 * - 1 hour on the start day (23:00-00:00)
 * - 7 hours on the next day (00:00-07:00)
 * Therefore, if the next day is a public holiday, the night shift
 * starting the previous day should be marked as off.
 *
 * @param date - The date to check
 * @param teamNumber - The team number (1-based)
 * @param scheduleType - The schedule type
 * @param publicHolidays - Map of public holidays by date string (YYYY/MM/DD format)
 * @returns True if this is a public holiday for this team's shift, false otherwise
 */
export function isPublicHolidayForShift(
  date: Dayjs,
  teamNumber: number | null,
  scheduleType: ScheduleOption | null | undefined,
  publicHolidays: Map<string, PublicHolidayInfo>,
): boolean {
  if (!teamNumber || publicHolidays.size === 0) {
    return false;
  }

  try {
    const shift = calculateShift(date, teamNumber, scheduleType);

    // For night shifts (23:00-07:00), check if the NEXT day is a holiday
    // because 7 out of 8 hours fall on the next day
    if (shift.code === "N") {
      const nextDay = date.add(1, "day");
      return publicHolidays.has(formatHdayDate(nextDay));
    }

    // For all other shifts (M, L, D, O), check the same day
    return publicHolidays.has(formatHdayDate(date));
  } catch (error) {
    // Invalid team number or other calculation error
    console.warn("isPublicHolidayForShift error:", error);
    return false;
  }
}

/**
 * Determines if a date is a working day for a user.
 *
 * A day is NOT a working day if:
 * 1. The shift schedule shows OFF (O) for that day
 * 2. There's a time-off event on that day
 * 3. It's a public holiday (with shift-specific logic for night shifts)
 *
 * @param date - The date to check
 * @param teamNumber - The user's team number (1-based), or null if not selected
 * @param scheduleType - The user's schedule type
 * @param entries - Array of time-off entries
 * @param publicHolidays - Map of public holidays by date string (YYYY/MM/DD format)
 * @returns True if this is a working day, false otherwise
 */
export function isWorkingDay(
  date: Dayjs,
  teamNumber: number | null,
  scheduleType: ScheduleOption | null | undefined,
  entries: TimeOffEntry[],
  publicHolidays: Map<string, PublicHolidayInfo>,
): boolean {
  // If no team selected, we can't determine working days
  if (!teamNumber) {
    return false;
  }

  try {
    // Check if scheduled shift is OFF
    const shift = calculateShift(date, teamNumber, scheduleType);
    if (!shift.isWorking) {
      return false;
    }

    // Check for time-off events
    if (hasTimeOffEvent(date, entries)) {
      return false;
    }

    // Check for public holidays (with shift-specific logic)
    if (isPublicHolidayForShift(date, teamNumber, scheduleType, publicHolidays)) {
      return false;
    }

    return true;
  } catch (error) {
    // If calculation fails (e.g., invalid team number), treat as non-working
    console.warn("isWorkingDay error:", error);
    return false;
  }
}

/**
 * Gets a reason why a day is not working.
 *
 * @param date - The date to check
 * @param teamNumber - The user's team number (1-based), or null if not selected
 * @param scheduleType - The user's schedule type
 * @param entries - Array of time-off entries
 * @param publicHolidays - Map of public holidays by date string (YYYY/MM/DD format)
 * @returns A reason string, or null if it's a working day
 */
export function getNonWorkingReason(
  date: Dayjs,
  teamNumber: number | null,
  scheduleType: ScheduleOption | null | undefined,
  entries: TimeOffEntry[],
  publicHolidays: Map<string, PublicHolidayInfo>,
): string | null {
  if (!teamNumber) {
    return "No team selected";
  }

  try {
    // Check shift schedule first
    const shift = calculateShift(date, teamNumber, scheduleType);
    if (!shift.isWorking) {
      return "Scheduled off day";
    }

    // Check for time-off events
    if (hasTimeOffEvent(date, entries)) {
      return "Time off";
    }

    // Check for public holidays
    if (isPublicHolidayForShift(date, teamNumber, scheduleType, publicHolidays)) {
      const holidayDate = shift.code === "N" ? date.add(1, "day") : date;
      const holiday = publicHolidays.get(formatHdayDate(holidayDate));
      return holiday ? `Public holiday: ${holiday.name}` : "Public holiday";
    }

    return null; // It's a working day
  } catch (error) {
    console.warn("getNonWorkingReason error:", error);
    return "Unable to determine";
  }
}
