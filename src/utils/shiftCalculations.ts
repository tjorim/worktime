/**
 * Shift Calculation Engine for Multiple Schedule Types
 *
 * Core business logic for calculating team shifts across different schedule patterns.
 *
 * ## Supported Schedule Types
 *
 * ### 5-shift (Continuous 24/7 Rotation)
 * Each team works a repeating 10-day cycle:
 * - 2 mornings (M): 07:00-15:00
 * - 2 evenings (L): 15:00-23:00
 * - 2 nights (N): 23:00-07:00
 * - 4 days off (O)
 *
 * The 5 teams are staggered by 2 days each, ensuring 24/7 coverage:
 * ```
 * Day:    1  2  3  4  5  6  7  8  9  10 | 11 12 13 ...
 * Team 1: M  M  L  L  N  N  O  O  O  O  | M  M  L  ...
 * Team 2: N  N  O  O  O  O  M  M  L  L  | N  N  O  ...
 * Team 3: O  O  M  M  L  L  N  N  O  O  | O  O  M  ...
 * Team 4: L  L  N  N  O  O  O  O  M  M  | L  L  N  ...
 * Team 5: O  O  O  O  M  M  L  L  N  N  | O  O  O  ...
 * ```
 *
 * ### Weekly Rotation Schedules
 * - **9-5**: Standard weekday schedule (Mon-Fri work, weekends off)
 * - **2-shift**: Alternating early/late shifts each week
 * - **weekend-shift**: Weekend-only teams with early/late rotation
 *
 * ## How It Works
 *
 * Each schedule type is self-contained with its own configuration:
 * 1. Reference date: When the reference team's pattern starts
 * 2. Reference team: Which team is at the reference point
 * 3. Schedule pattern: Cycle-based or weekly-rotation pattern
 *
 * For cycle-based schedules:
 * - Calculate days since reference date
 * - Apply team offset based on cycle length and team count
 * - Map position in cycle to shift type
 *
 * For weekly-rotation schedules:
 * - Calculate weeks since reference date
 * - Apply team offset in weeks
 * - Match ISO weekday to pattern
 *
 * ## Date Code Format (YYWW.DX)
 *
 * Shifts are identified by a compact code: `YYWW.DX`
 * - `YY`: 2-digit year (25 = 2025)
 * - `WW`: ISO week number (01-53)
 * - `D`: ISO weekday (1=Monday, 7=Sunday)
 * - `X`: Shift type (M/L/N/D/O)
 *
 * **Important**: Night shifts use the PREVIOUS day's date code because they start
 * at 23:00 on that day (e.g., Monday night is coded as Monday, not Tuesday).
 *
 * ## Edge Cases
 *
 * - **Pre-07:00 times**: Mapped to previous day's night shift via `getCurrentShiftDay()` for schedules with night shifts
 * - **Invalid team numbers**: Throw error (fail fast)
 * - **Invalid dates**: Handled by dayjs (may return Invalid Date)
 * - **Year boundaries**: ISO week dates handled correctly (week 1 can be in December)
 *
 * @module utils/shiftCalculations
 */

import type { Dayjs } from "dayjs";
import { type ScheduleOption } from "../data/rosters";
import { dayjs, formatYYWWD, getLocalizedShiftTime } from "./dateTimeUtils";
import { getScheduleConfig } from "./scheduleUtils";

type NullableScheduleOption = ScheduleOption | null | undefined;

export type ShiftType = "M" | "L" | "N" | "D" | "O";

export interface Shift {
  code: ShiftType;
  emoji: string;
  name: string;
  hours: string;
  start: number | null;
  end: number | null;
  isWorking: boolean;
  className: string;
}

/**
 * Type for shifts that may include unknown/fallback codes.
 * Used by functions that can return shifts with codes outside the standard ShiftType set.
 */
export type ShiftOrUnknown = Omit<Shift, "code"> & { code: string };

export interface ShiftResult {
  date: Dayjs;
  shift: Shift;
  code: string;
  teamNumber: number;
}

export interface UpcomingShiftResult {
  date: Dayjs;
  shift: Shift;
  code: string;
}

export interface OffDayProgress {
  current: number;
  total: number;
}

const getScheduleForOption = (scheduleOption?: NullableScheduleOption) =>
  getScheduleConfig(scheduleOption);

const buildShift = (
  code: ShiftType,
  definition: {
    name: string;
    hours: string;
    start: number | null;
    end: number | null;
    isWorking: boolean;
  },
  emoji: string,
  className: string,
): Shift => {
  return {
    code,
    emoji,
    name: definition.name,
    hours: definition.hours,
    start: definition.start,
    end: definition.end,
    isWorking: definition.isWorking,
    className,
  };
};

const getShiftTimeDefinition = (
  scheduleOption: NullableScheduleOption,
  code: ShiftType,
) => {
  const schedule = getScheduleForOption(scheduleOption);
  return schedule.shiftConfig.shiftTimes[code];
};

const buildShiftTemplate = (
  code: ShiftType,
  emoji: string,
  className: string,
  isWorking: boolean,
): Shift =>
  buildShift(
    code,
    {
      name: "",
      hours: "",
      start: null,
      end: null,
      isWorking,
    },
    emoji,
    className,
  );

export const SHIFTS = Object.freeze({
  MORNING: Object.freeze(buildShiftTemplate("M", "🌅", "shift-morning", true)),
  LATE: Object.freeze(buildShiftTemplate("L", "🌆", "shift-late", true)),
  DAY: Object.freeze(buildShiftTemplate("D", "☀️", "shift-day", true)),
  NIGHT: Object.freeze(buildShiftTemplate("N", "🌙", "shift-night", true)),
  OFF: Object.freeze(buildShiftTemplate("O", "🏠", "shift-off", false)),
});

const scheduleHasNightShift = (scheduleOption: NullableScheduleOption): boolean => {
  const schedule = getScheduleForOption(scheduleOption);
  return schedule.shiftConfig.schedulePattern.days.some((day) => day.shift === "N");
};

const getTeamCountForSchedule = (scheduleOption?: NullableScheduleOption) => {
  const schedule = getScheduleForOption(scheduleOption);
  return schedule.shiftConfig.teamCount;
};

const getCycleLengthForSchedule = (scheduleOption?: NullableScheduleOption) => {
  const schedule = getScheduleForOption(scheduleOption);
  return schedule.shiftConfig.cycleLengthDays;
};

const getReferenceDateForSchedule = (scheduleOption?: NullableScheduleOption): Dayjs => {
  const schedule = getScheduleForOption(scheduleOption);
  const referenceDate = dayjs(schedule.shiftConfig.referenceDate, "YYYY-MM-DD", true);
  if (!referenceDate.isValid()) {
    throw new Error(
      `Invalid referenceDate format for schedule ${schedule.value}: ${schedule.shiftConfig.referenceDate}`,
    );
  }
  return referenceDate.startOf("day");
};

const getReferenceTeamForSchedule = (scheduleOption?: NullableScheduleOption): number => {
  const schedule = getScheduleForOption(scheduleOption);
  return schedule.shiftConfig.referenceTeam;
};

const mapShiftCodeToShift = (
  code: ShiftType,
  scheduleOption?: NullableScheduleOption,
): Shift => {
  const definition = getShiftTimeDefinition(scheduleOption, code);
  if (!definition) {
    return SHIFTS.OFF;
  }
  switch (code) {
    case "M":
      return buildShift(code, definition, "🌅", "shift-morning");
    case "L":
      return buildShift(code, definition, "🌆", "shift-late");
    case "N":
      return buildShift(code, definition, "🌙", "shift-night");
    case "D":
      return buildShift(code, definition, "☀️", "shift-day");
    case "O":
      return buildShift(code, definition, "🏠", "shift-off");
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
};

/**
 * Calculate the team offset index from a reference team.
 * Returns the number of units (days or weeks depending on pattern) this team is offset from the reference team.
 * @param teamNumber - The team number to calculate the offset for
 * @param teamCount - Total number of teams in the schedule
 * @param referenceTeam - The reference team number (1-indexed)
 * @returns The offset index (0 to teamCount-1)
 */
const getTeamOffsetUnits = (teamNumber: number, teamCount: number, referenceTeam: number) => {
  if (teamCount <= 1) return 0;
  // Normalize to [0..teamCount-1] range to handle cases where teamNumber < referenceTeam
  return (((teamNumber - referenceTeam) % teamCount) + teamCount) % teamCount;
};

const getCycleTeamOffsetDays = (scheduleOption?: NullableScheduleOption, teamNumber?: number) => {
  const teamCount = getTeamCountForSchedule(scheduleOption);
  const cycleLength = getCycleLengthForSchedule(scheduleOption);
  const referenceTeam = getReferenceTeamForSchedule(scheduleOption);
  if (!teamNumber || teamCount <= 1 || cycleLength <= 0) return 0;

  // For weekly rotation schedules (multiples of 7), use week-based offset
  // to ensure teams are on different weeks, not just different positions in cycle
  const offsetStep = cycleLength % 7 === 0 ? 7 : Math.floor(cycleLength / teamCount);
  return getTeamOffsetUnits(teamNumber, teamCount, referenceTeam) * offsetStep;
};

/**
 * Combine a shift's emoji and name into a single display label.
 *
 * @param shift - The shift object whose emoji and name will be used
 * @returns The display string in the form "`<emoji> <name>`"
 */
export function getShiftDisplayName(shift: ShiftOrUnknown): string {
  return `${shift.emoji} ${shift.name}`;
}

/**
 * Get roster-specific display properties for a shift.
 *
 * Returns the shift's display name and hours, applying roster-specific overrides if configured.
 * For example, the 5-shift roster displays "Evening" for L shifts, while 2-shift displays "Late".
 *
 * @param shift - The shift object to get display properties for
 * @param scheduleOption - Optional schedule type; defaults to 5-shift if not provided
 * @returns Object containing displayName and displayHours (may be overridden by roster config)
 *
 * @example
 * // 5-shift roster: L shift shows as "Evening"
 * const display = getShiftDisplay(SHIFTS.LATE, "5-shift");
 * // Returns: { displayName: "Evening", displayHours: "15:00-23:00" }
 *
 * @example
 * // 2-shift roster: M shift shows as "Early"
 * const display = getShiftDisplay(SHIFTS.MORNING, "2-shift");
 * // Returns: { displayName: "Early", displayHours: "07:00-15:00" }
 */
export function getShiftDisplay(
  shift: ShiftOrUnknown,
  scheduleOption?: NullableScheduleOption,
): { displayName: string; displayHours: string; displayCode: string } {
  const schedule = getScheduleForOption(scheduleOption);
  const shiftTimes = schedule.shiftConfig.shiftTimes[shift.code as ShiftType];

  return {
    displayName: shiftTimes?.name ?? shift.name,
    displayHours: shiftTimes?.hours ?? shift.hours,
    displayCode: shiftTimes?.displayCode ?? shift.code,
  };
}

/**
 * Format shift time with localization, falling back to display hours when localization is unavailable.
 *
 * Returns localized shift time (e.g., "7:00 AM - 3:00 PM") when the shift has valid start and end
 * times. If the shift start/end are null or invalid, or if localization fails, it falls back to the
 * roster-specific display hours from shift time definitions. This ensures consistent shift time
 * formatting across the app.
 *
 * @param shift - Shift object with code, start, and end times
 * @param scheduleOption - Schedule option used to resolve shift time definitions
 * @param timeFormat - Time format preference ("12h" or "24h")
 * @returns Formatted shift time string
 */
export function getFormattedShiftTime(
  shift: ShiftOrUnknown,
  scheduleOption: NullableScheduleOption,
  timeFormat: "12h" | "24h",
): string {
  const { displayHours } = getShiftDisplay(shift, scheduleOption);
  return shift.start != null && shift.end != null
    ? (getLocalizedShiftTime(shift.start, shift.end, timeFormat) ?? displayHours)
    : displayHours;
}

/**
 * Retrieve a shift definition for a given shift code, returning an 'Unknown' shift object when no match is found.
 *
 * @param code - Shift code to look up; may be null or undefined
 * @param scheduleOption - Optional schedule type; defaults to 5-shift if not provided
 * @returns The matching shift object from `SHIFTS`, or a fallback object with code `'U'`, emoji `❓`, name `'Unknown'`, non-working flags and null times when no match exists
 */
export function getShiftByCode(
  code: string | null | undefined,
  scheduleOption?: NullableScheduleOption,
): ShiftOrUnknown {
  if (code && ["M", "L", "N", "D", "O"].includes(code)) {
    return mapShiftCodeToShift(code as ShiftType, scheduleOption);
  }
  return {
    code: "U",
    emoji: "❓",
    name: "Unknown",
    hours: "Unknown hours",
    start: null,
    end: null,
    isWorking: false,
    className: "shift-off",
  };
}

/**
 * Determine the scheduled shift for a team on a given date.
 *
 * Edge cases:
 * - Invalid dates are handled by dayjs (may return Invalid Date)
 * - Team numbers outside the valid range (1 to teamCount) throw an error
 * - Date strings, Date objects, and Dayjs instances are all accepted
 * - Times are ignored; only the calendar date matters for shift calculation
 *
 * @param date - Date to evaluate (string, Date or Dayjs)
 * @param teamNumber - Team index starting at 1; must be between 1 and the schedule's team count
 * @param scheduleOption - Optional schedule type; defaults to 5-shift if not provided
 * @returns The Shift object for that team and date (one of MORNING, EVENING, NIGHT or OFF)
 * @throws {Error} If `teamNumber` is outside the valid range
 *
 * @example
 * // Get Team 1's shift on a specific date
 * calculateShift('2025-01-06', 1)
 * // Returns: { code: 'M', name: 'Morning', hours: '07:00-15:00', ... }
 *
 * @example
 * // Using a Date object
 * calculateShift(new Date('2025-01-08'), 1)
 * // Returns: { code: 'E', name: 'Evening', hours: '15:00-23:00', ... }
 *
 * @example
 * // Invalid team number throws error
 * calculateShift('2025-01-06', 6) // For 5-shift schedule
 * // Throws: Error("Invalid team number: 6. Expected 1-5")
 */
export function calculateShift(
  date: string | Date | Dayjs,
  teamNumber: number,
  scheduleOption?: NullableScheduleOption,
): Shift {
  const teamCount = getTeamCountForSchedule(scheduleOption);
  // Validate team number
  if (teamNumber < 1 || teamNumber > teamCount) {
    throw new Error(`Invalid team number: ${teamNumber}. Expected 1-${teamCount}`);
  }

  const targetDate = dayjs(date).startOf("day");
  const referenceDate = getReferenceDateForSchedule(scheduleOption);
  const schedule = getScheduleForOption(scheduleOption);
  const schedulePattern = schedule.shiftConfig.schedulePattern;

  // Calculate days since reference
  const daysSinceReference = targetDate.diff(referenceDate, "day");

  // All schedules use the unified pattern-based structure
  const cycleLength = getCycleLengthForSchedule(scheduleOption);
  const teamOffset = getCycleTeamOffsetDays(scheduleOption, teamNumber);
  const adjustedDays = daysSinceReference - teamOffset;
  const cyclePosition = ((adjustedDays % cycleLength) + cycleLength) % cycleLength;
  const dayIndex = cyclePosition + 1;
  const matchingDay = schedulePattern.days.find((day) => day.dayIndex === dayIndex);
  if (!matchingDay) {
    // This indicates a likely configuration error: the schedulePattern is missing
    // an entry for the computed dayIndex. We keep the existing behavior of
    // returning SHIFTS.OFF but emit a warning to aid diagnosis.
    console.warn(
      `[shiftCalculations] Missing schedulePattern day for dayIndex=${dayIndex} (cyclePosition=${cyclePosition}, cycleLength=${cycleLength}, teamNumber=${teamNumber}, schedule=${schedule.value}). Falling back to SHIFTS.OFF.`,
    );
    return SHIFTS.OFF;
  }
  return mapShiftCodeToShift(matchingDay.shift, scheduleOption);
}

/**
 * Map a timestamp to the shift's effective day, assigning times before 07:00 to the previous calendar day
 * only for schedules that include night shifts.
 *
 * This is critical for night shift handling: since night shifts run from 23:00 to 07:00,
 * any time between 00:00 and 06:59 belongs to the previous day's night shift.
 *
 * @param date - The date or timestamp to evaluate
 * @param scheduleOption - Optional schedule type; defaults to night-shift behavior when omitted
 * @returns The Dayjs representing the shift day (the previous day if `date` is before 07:00 and the schedule has night shifts)
 *
 * @example
 * // During morning hours (7am or later) - same day
 * getCurrentShiftDay('2025-01-15 09:30')
 * // Returns: Dayjs for 2025-01-15
 *
 * @example
 * // During night shift (before 7am) - previous day
 * getCurrentShiftDay('2025-01-15 02:30')
 * // Returns: Dayjs for 2025-01-14 (previous day's night shift)
 */
export function getCurrentShiftDay(
  date: string | Date | Dayjs,
  scheduleOption?: NullableScheduleOption,
): Dayjs {
  const current = dayjs(date);
  const hour = current.hour();
  const usesNightShift = scheduleOption == null || scheduleHasNightShift(scheduleOption);

  // Schedules with night shifts keep the legacy 07:00 cutoff because the shift day
  // is anchored to the prior calendar day. Schedules without night shifts should
  // follow the calendar day without adjustment.
  if (usesNightShift && hour < 7) {
    return current.subtract(1, "day");
  }

  return current;
}

/**
 * Generate the shift code for a given date and team, using the previous calendar day for night shifts.
 *
 * The shift code follows the format YYWW.DX where:
 * - YY = last two digits of year
 * - WW = ISO week number (01-53)
 * - D = ISO weekday (1=Monday, 7=Sunday)
 * - X = shift type (M/L/N/O)
 *
 * Night shifts use the previous calendar day for their code (e.g., Monday night shift is coded as Monday, not Tuesday).
 *
 * @param date - The date to evaluate (string, Date or Dayjs); night shifts map to the prior calendar day for code generation
 * @param teamNumber - The team number
 * @returns The shift code in the format YYWW.DX (for example, "2520.2M")
 *
 * @example
 * // Morning shift on Tuesday, Week 20, 2025
 * getShiftCode('2025-05-13', 1)
 * // Returns: "2520.2M"
 *
 * @example
 * // Night shift uses previous day's date code
 * getShiftCode('2025-05-13', 3) // Assuming Team 3 has night shift
 * // Returns: "2520.1N" (Monday's code, not Tuesday)
 *
 * @see getCurrentShiftDay For how night shifts are mapped to the previous day
 */
export function getShiftCode(
  date: string | Date | Dayjs,
  teamNumber: number,
  scheduleOption?: NullableScheduleOption,
): string {
  const shift = calculateShift(date, teamNumber, scheduleOption);
  let codeDate = dayjs(date);

  // For night shifts, use the previous day's date code
  if (shift.code === "N") {
    codeDate = codeDate.subtract(1, "day");
  }

  // Inline formatDateCode logic
  const dateCode = formatYYWWD(codeDate);
  return `${dateCode}${shift.code}`;
}

/**
 * Locate the next working shift for a team after a given date.
 *
 * Searches up to the schedule's cycle length ahead to find the next working shift.
 * Returns null if team number is invalid or no working shift is found in the cycle.
 *
 * @param fromDate - Date to start the search from (exclusive)
 * @param teamNumber - Team identifier; must be within the schedule's valid team range
 * @param scheduleOption - Optional schedule type; defaults to 5-shift if not provided
 * @returns The upcoming shift result containing `date`, `shift` and `code`, or `null` if no working shift is found within the shift cycle
 *
 * @example
 * // Find Team 1's next shift after January 6, 2025
 * getNextShift('2025-01-06', 1)
 * // Returns: { date: Dayjs('2025-01-07'), shift: SHIFTS.MORNING, code: '2502.2M' }
 *
 * @example
 * // Invalid team number returns null
 * getNextShift('2025-01-06', 99)
 * // Returns: null
 *
 * @see calculateShift For the underlying shift calculation logic
 */
export function getNextShift(
  fromDate: string | Date | Dayjs,
  teamNumber: number,
  scheduleOption?: NullableScheduleOption,
): UpcomingShiftResult | null {
  // Validate team number range
  const teamCount = getTeamCountForSchedule(scheduleOption);
  if (teamNumber < 1 || teamNumber > teamCount) {
    return null;
  }

  let checkDate = dayjs(fromDate).add(1, "day");
  const cycleLength = getCycleLengthForSchedule(scheduleOption);

  for (let i = 0; i < cycleLength; i++) {
    const shift = calculateShift(checkDate, teamNumber, scheduleOption);
    if (shift.isWorking) {
      return {
        date: checkDate,
        shift: shift,
        code: getShiftCode(checkDate, teamNumber, scheduleOption),
      };
    }
    checkDate = checkDate.add(1, "day");
  }

  return null;
}

/**
 * Return the shift assignment for every team on the given date.
 *
 * Useful for displaying the "Today" or "Schedule" view showing all teams at once.
 * Results are ordered by team number (1 to the schedule's team count).
 *
 * @param date - The reference date (string, Date or Dayjs) for which to compute each team's shift
 * @param scheduleOption - Optional schedule type; defaults to 5-shift if not provided
 * @returns An array of ShiftResult objects where each item contains the provided date as a Dayjs, the team's shift, the shift code and the team number
 *
 * @example
 * // Get all teams' shifts for January 6, 2025
 * getAllTeamsShifts('2025-01-06')
 * // Returns: [
 * //   { date: Dayjs('2025-01-06'), shift: SHIFTS.MORNING, code: '2502.1M', teamNumber: 1 },
 * //   { date: Dayjs('2025-01-06'), shift: SHIFTS.OFF, code: '2502.1O', teamNumber: 2 },
 * //   { date: Dayjs('2025-01-06'), shift: SHIFTS.NIGHT, code: '2501.7N', teamNumber: 3 },
 * //   ...
 * // ]
 *
 * @see calculateShift For individual team shift calculation
 */
export function getAllTeamsShifts(
  date: string | Date | Dayjs,
  scheduleOption?: NullableScheduleOption,
): ShiftResult[] {
  const results: ShiftResult[] = [];
  const teamCount = getTeamCountForSchedule(scheduleOption);

  for (let teamNumber = 1; teamNumber <= teamCount; teamNumber++) {
    const shift = calculateShift(date, teamNumber, scheduleOption);
    const code = getShiftCode(date, teamNumber, scheduleOption);

    results.push({
      date: dayjs(date),
      shift,
      code,
      teamNumber,
    });
  }

  return results;
}

/**
 * Determine which day of a team's off period the given date falls on.
 *
 * For cycle-based schedules (e.g., 5-shift), calculates position within the team's off days (typically 4 days).
 * For weekly-rotation schedules (e.g., 9-5), calculates position within consecutive off days (e.g., weekends).
 *
 * @param date - Date to evaluate (string | Date | Dayjs)
 * @param teamNumber - 1-based team index; must be between 1 and team count for the schedule
 * @param scheduleOption - Optional schedule type; defaults to 5-shift if not provided
 * @returns `OffDayProgress` with `current` (1-indexed day within off period) and `total` (length of off period) if the team is currently on an off day, `null` if the team is working or `teamNumber` is out of range
 */
export function getOffDayProgress(
  date: string | Date | Dayjs,
  teamNumber: number,
  scheduleOption?: NullableScheduleOption,
): OffDayProgress | null {
  // Validate team number
  const teamCount = getTeamCountForSchedule(scheduleOption);
  if (teamNumber < 1 || teamNumber > teamCount) {
    return null;
  }

  const currentShift = calculateShift(date, teamNumber, scheduleOption);

  // Only calculate for teams that are off
  if (currentShift.isWorking) {
    return null;
  }

  const cycleLength = getCycleLengthForSchedule(scheduleOption);
  let totalOffDays: number | null = null;

  // Find the start of the current off-day period by looking backwards
  let periodStartDate: Dayjs | null = null;
  let checkDate = getCurrentShiftDay(dayjs(date), scheduleOption);

  for (let i = 0; i < cycleLength; i++) {
    const tempDate = checkDate.subtract(i, "day");
    const shift = calculateShift(tempDate, teamNumber, scheduleOption);
    if (shift.isWorking) {
      periodStartDate = tempDate.add(1, "day");
      break;
    }
    if (i === cycleLength - 1) {
      // All days in cycle are off days
      periodStartDate = tempDate;
    }
  }

  if (periodStartDate) {
    // Count forward from the start of the period to find its length
    let periodLength = 0;
    for (let i = 0; i < cycleLength; i++) {
      const tempDate = periodStartDate.add(i, "day");
      const shift = calculateShift(tempDate, teamNumber, scheduleOption);
      if (shift.isWorking) {
        break;
      }
      periodLength++;
    }
    totalOffDays = periodLength > 0 ? periodLength : null;
  }

  // Calculate which day of the off period we're currently in
  let dayCount = 0;
  if (totalOffDays && periodStartDate) {
    const currentShiftDay = getCurrentShiftDay(dayjs(date), scheduleOption);
    // Direct calculation is simpler and more performant than a loop
    dayCount = currentShiftDay.diff(periodStartDate, "day") + 1;
  }

  if (!totalOffDays) {
    return null;
  }

  return dayCount > 0 ? { current: dayCount, total: totalOffDays } : null;
}

/**
 * Determine whether the given shift is active at the specified reference time for its assigned date.
 *
 * @param shift - Object containing `code` and `start`/`end` hour values; `start` and `end` are hours in 0–23 or `null` when not applicable
 * @param date - The shift's assigned date (Dayjs)
 * @param currentTime - The reference time used to decide activity and to align to the shift's effective day
 * @returns `true` if the shift is active at `currentTime` for `date`, `false` otherwise
 */
export function isCurrentlyWorking(
  shift: { code: string; start: number | null; end: number | null },
  date: Dayjs,
  currentTime: Dayjs,
  scheduleOption?: NullableScheduleOption,
): boolean {
  // Explicitly check for null/undefined to handle midnight (0) as a valid start time
  if (shift.start == null || shift.end == null) return false;

  const shiftDay = getCurrentShiftDay(currentTime, scheduleOption);
  if (!shiftDay.isSame(date, "day")) return false;

  const hour = currentTime.hour() + currentTime.minute() / 60;

  // Detect shifts spanning midnight by comparing start/end hours (more robust than checking shift code)
  if (shift.start > shift.end) {
    return hour >= shift.start || hour < shift.end;
  }

  return hour >= shift.start && hour < shift.end;
}

/**
 * Find which team is currently working right now.
 *
 * Checks today first, then falls back to yesterday to handle night shifts
 * that span midnight (e.g., a night shift starting at 23:00 yesterday is
 * still working until 07:00 today).
 *
 * @param currentTime - The current time to check against
 * @param scheduleType - The schedule type (defaults to 5-shift if not provided)
 * @returns The shift result for the currently working team, or null if no team is working
 *
 * @example
 * const currentTeam = getCurrentWorkingTeam(dayjs(), "5-shift");
 * if (currentTeam) {
 *   console.log(`Team ${currentTeam.teamNumber} is working ${currentTeam.shift.name}`);
 * }
 */
export function getCurrentWorkingTeam(
  currentTime: Dayjs,
  scheduleType?: ScheduleOption | null | undefined,
): ShiftResult | null {
  const today = currentTime.startOf("day");

  // Check today first
  const allTeamsToday = getAllTeamsShifts(today, scheduleType);
  const workingToday = allTeamsToday.find((teamShift) => {
    if (!teamShift.shift.isWorking) return false;
    return isCurrentlyWorking(teamShift.shift, teamShift.date, currentTime, scheduleType);
  });

  if (workingToday) return workingToday;

  // Fall back to yesterday for night shifts spanning midnight
  const yesterday = today.subtract(1, "day");
  const allTeamsYesterday = getAllTeamsShifts(yesterday, scheduleType);
  const workingYesterday = allTeamsYesterday.find((teamShift) => {
    if (!teamShift.shift.isWorking) return false;
    return isCurrentlyWorking(teamShift.shift, teamShift.date, currentTime, scheduleType);
  });

  return workingYesterday || null;
}
