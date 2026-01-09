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
 * - `X`: Shift type (M/E/N/O)
 *
 * **Important**: Night shifts use the PREVIOUS day's date code because they start
 * at 23:00 on that day (e.g., Monday night is coded as Monday, not Tuesday).
 *
 * ## Edge Cases
 *
 * - **Pre-07:00 times**: Mapped to previous day's night shift via `getCurrentShiftDay()`
 * - **Invalid team numbers**: Throw error (fail fast)
 * - **Invalid dates**: Handled by dayjs (may return Invalid Date)
 * - **Year boundaries**: ISO week dates handled correctly (week 1 can be in December)
 *
 * @module utils/shiftCalculations
 */

import type { Dayjs } from "dayjs";
import type { ScheduleOption } from "../data/rosters";
import { dayjs, formatYYWWD } from "./dateTimeUtils";
import { getScheduleConfig } from "./scheduleUtils";

type NullableScheduleOption = ScheduleOption | null | undefined;

export type ShiftType = "M" | "L" | "N" | "O";

export interface Shift {
  code: ShiftType;
  name: string;
  hours: string;
  start: number | null;
  end: number | null;
  isWorking: boolean;
  className: string;
}

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

// Shift definitions
export const SHIFTS = Object.freeze({
  MORNING: Object.freeze({
    code: "M",
    emoji: "🌅",
    name: "Morning",
    hours: "07:00-15:00",
    start: 7,
    end: 15,
    isWorking: true,
    className: "shift-morning",
  }),
  EVENING: Object.freeze({
    code: "L",
    emoji: "🌆",
    name: "Evening",
    hours: "15:00-23:00",
    start: 15,
    end: 23,
    isWorking: true,
    className: "shift-evening",
  }),
  NIGHT: Object.freeze({
    code: "N",
    emoji: "🌙",
    name: "Night",
    hours: "23:00-07:00",
    start: 23,
    end: 7,
    isWorking: true,
    className: "shift-night",
  }),
  OFF: Object.freeze({
    code: "O",
    emoji: "🏠",
    name: "Off",
    hours: "Not working",
    start: null,
    end: null,
    isWorking: false,
    className: "shift-off",
  }),
});

const getRosterForSchedule = (scheduleOption?: NullableScheduleOption) =>
  getScheduleConfig(scheduleOption);

const getTeamCountForSchedule = (scheduleOption?: NullableScheduleOption) => {
  const roster = getRosterForSchedule(scheduleOption);
  if (roster.shiftConfig.teamCount === undefined) {
    throw new Error(`teamCount not defined for schedule ${roster.value}`);
  }
  return roster.shiftConfig.teamCount;
};

const getCycleLengthForSchedule = (scheduleOption?: NullableScheduleOption) => {
  const roster = getRosterForSchedule(scheduleOption);
  if (roster.shiftConfig.cycleLengthDays === undefined) {
    throw new Error(`cycleLengthDays not defined for schedule ${roster.value}`);
  }
  return roster.shiftConfig.cycleLengthDays;
};

const getReferenceDateForSchedule = (scheduleOption?: NullableScheduleOption): Date => {
  const roster = getRosterForSchedule(scheduleOption);
  if (!roster.shiftConfig.referenceDate) {
    throw new Error(`referenceDate not defined for schedule ${roster.value}`);
  }
  return new Date(`${roster.shiftConfig.referenceDate}T00:00:00.000Z`);
};

const getReferenceTeamForSchedule = (scheduleOption?: NullableScheduleOption): number => {
  const roster = getRosterForSchedule(scheduleOption);
  if (roster.shiftConfig.referenceTeam === undefined) {
    throw new Error(`referenceTeam not defined for schedule ${roster.value}`);
  }
  return roster.shiftConfig.referenceTeam;
};

const mapShiftCodeToShift = (code: "M" | "E" | "N" | "O" | "D" | "L") => {
  switch (code) {
    case "M":
      return SHIFTS.MORNING;
    case "E":
      return SHIFTS.EVENING;
    case "N":
      return SHIFTS.NIGHT;
    case "O":
      return SHIFTS.OFF;
    case "D":
      return SHIFTS.MORNING;
    case "L":
      return SHIFTS.EVENING;
    default:
      return SHIFTS.OFF;
  }
};

const getTeamOffsetUnits = (
  teamNumber: number,
  teamCount: number,
  referenceTeam: number,
) => {
  if (teamCount <= 1) return 0;
  return (teamNumber - referenceTeam) % teamCount;
};

const getCycleTeamOffsetDays = (
  scheduleOption?: NullableScheduleOption,
  teamNumber?: number,
) => {
  const teamCount = getTeamCountForSchedule(scheduleOption);
  const cycleLength = getCycleLengthForSchedule(scheduleOption);
  const referenceTeam = getReferenceTeamForSchedule(scheduleOption);
  if (!teamNumber || teamCount <= 1 || cycleLength <= 0) return 0;

  const offsetStep = Math.floor(cycleLength / teamCount);
  return getTeamOffsetUnits(teamNumber, teamCount, referenceTeam) * offsetStep;
};

/**
 * Combine a shift's emoji and name into a single display label.
 *
 * @param shift - The shift object whose emoji and name will be used
 * @returns The display string in the form "`<emoji> <name>`"
 */
export function getShiftDisplayName(shift: ReturnType<typeof getShiftByCode>): string {
  return `${shift.emoji} ${shift.name}`;
}

/**
 * Retrieve a shift definition for a given shift code, returning an 'Unknown' shift object when no match is found.
 *
 * @param code - Shift code to look up; may be null or undefined
 * @returns The matching shift object from `SHIFTS`, or a fallback object with code `'U'`, emoji `❓`, name `'Unknown'`, non-working flags and null times when no match exists
 */
export function getShiftByCode(code: string | null | undefined) {
  const shift = Object.values(SHIFTS).find((s) => s.code === code);
  return (
    shift || {
      code: "U",
      emoji: "❓",
      name: "Unknown",
      hours: "Unknown hours",
      start: null,
      end: null,
      isWorking: false,
      className: "shift-off",
    }
  );
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
  const referenceDate = dayjs(getReferenceDateForSchedule(scheduleOption)).startOf("day");
  const roster = getRosterForSchedule(scheduleOption);
  const schedulePattern = roster.shiftConfig.schedulePattern;

  // Calculate days since reference
  const daysSinceReference = targetDate.diff(referenceDate, "day");

  // All patterns now use the unified day-based structure
  if (schedulePattern) {
    const cycleLength = getCycleLengthForSchedule(scheduleOption);
    const teamOffset = getCycleTeamOffsetDays(scheduleOption, teamNumber);
    const adjustedDays = daysSinceReference - teamOffset;
    const cyclePosition =
      ((adjustedDays % cycleLength) + cycleLength) % cycleLength;
    const dayIndex = cyclePosition + 1;
    const matchingDay = schedulePattern.days.find((day) => day.dayIndex === dayIndex);
    if (!matchingDay) {
      return SHIFTS.OFF;
    }
    return mapShiftCodeToShift(matchingDay.shift);
  }

  // Fallback to legacy 5-shift cycle logic when no roster pattern is configured.
  // This should not be reached now that all rosters have patterns, but kept for safety.
  const referenceTeam = getReferenceTeamForSchedule(scheduleOption);
  const teamOffset = (teamNumber - referenceTeam) * 2;
  const adjustedDays = daysSinceReference - teamOffset;
  const cycleLength = getCycleLengthForSchedule(scheduleOption);
  const cyclePosition =
    ((adjustedDays % cycleLength) + cycleLength) % cycleLength;

  if (cyclePosition < 2) {
    return SHIFTS.MORNING;
  }
  if (cyclePosition < 4) {
    return SHIFTS.EVENING;
  }
  if (cyclePosition < 6) {
    return SHIFTS.NIGHT;
  }
  return SHIFTS.OFF;
}

/**
 * Map a timestamp to the shift's effective day, assigning times before 07:00 to the previous calendar day.
 *
 * This is critical for night shift handling: since night shifts run from 23:00 to 07:00,
 * any time between 00:00 and 06:59 belongs to the previous day's night shift.
 *
 * @param date - The date or timestamp to evaluate
 * @returns The Dayjs representing the shift day (the previous day if `date` is before 07:00)
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
export function getCurrentShiftDay(date: string | Date | Dayjs): Dayjs {
  const current = dayjs(date);
  const hour = current.hour();

  // If it's before 7 AM, we're in the previous day's night shift
  if (hour < 7) {
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

  const roster = getRosterForSchedule(scheduleOption);
  const schedulePattern = roster.shiftConfig.schedulePattern;
  
  let totalOffDays: number | null = null;
  
  if (schedulePattern) {
    // For cycle-based patterns, find the maximum consecutive off days
    // This works for both simple patterns (5-shift with 4 consecutive off days)
    // and complex patterns (9-5 with weekend pattern, 2-shift with variable weekends)
    
    const cycleLength = getCycleLengthForSchedule(scheduleOption);
    let maxConsecutiveOff = 0;
    let currentConsecutiveOff = 0;
    
    // Scan through the entire cycle to find the longest consecutive off period
    for (let i = 0; i < cycleLength; i++) {
      const dayIndex = i + 1;
      const day = schedulePattern.days.find((d) => d.dayIndex === dayIndex);
      
      if (!day || day.shift === "O") {
        // This day is off
        currentConsecutiveOff++;
        maxConsecutiveOff = Math.max(maxConsecutiveOff, currentConsecutiveOff);
      } else {
        // Reset consecutive count
        currentConsecutiveOff = 0;
      }
    }
    
    // Check wrap-around: if both end and start of cycle are off, count consecutive days across boundary
    const lastDay = schedulePattern.days.find((d) => d.dayIndex === cycleLength);
    const firstDay = schedulePattern.days.find((d) => d.dayIndex === 1);
    const lastIsOff = !lastDay || lastDay.shift === "O";
    const firstIsOff = !firstDay || firstDay.shift === "O";
    
    if (lastIsOff && firstIsOff) {
      // Count consecutive off days from beginning of cycle
      let startConsecutiveOff = 0;
      for (let i = 0; i < cycleLength; i++) {
        const dayIndex = i + 1;
        const day = schedulePattern.days.find((d) => d.dayIndex === dayIndex);
        if (!day || day.shift === "O") {
          startConsecutiveOff++;
        } else {
          break; // Stop at first working day
        }
      }
      
      // Count consecutive off days from end of cycle (backward)
      let endConsecutiveOff = 0;
      for (let i = cycleLength - 1; i >= 0; i--) {
        const dayIndex = i + 1;
        const day = schedulePattern.days.find((d) => d.dayIndex === dayIndex);
        if (!day || day.shift === "O") {
          endConsecutiveOff++;
        } else {
          break; // Stop at first working day
        }
      }
      
      // If the entire cycle is off, startConsecutiveOff will already equal cycleLength
      if (startConsecutiveOff === cycleLength) {
        maxConsecutiveOff = Math.max(maxConsecutiveOff, cycleLength);
      } else {
        // Combine off days at both ends of the cycle across the boundary
        maxConsecutiveOff = Math.max(
          maxConsecutiveOff,
          startConsecutiveOff + endConsecutiveOff
        );
      }
    }
    
    totalOffDays = maxConsecutiveOff > 0 ? maxConsecutiveOff : null;
  }

  // Team is off, calculate which day of their off period
  let dayCount = 0;
  let checkDate = getCurrentShiftDay(dayjs(date));

  // Look backwards to find when this off period started
  const cycleLength = getCycleLengthForSchedule(scheduleOption);
  for (let i = 0; i < cycleLength; i++) {
    // Max 10 days to avoid infinite loop
    const shift = calculateShift(checkDate, teamNumber, scheduleOption);
    if (shift.isWorking) {
      break; // Found the last working day
    }
    dayCount++;
    checkDate = checkDate.subtract(1, "day");
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
): boolean {
  // Explicitly check for null/undefined to handle midnight (0) as a valid start time
  if (shift.start == null || shift.end == null) return false;

  const shiftDay = getCurrentShiftDay(currentTime);
  if (!shiftDay.isSame(date, "day")) return false;

  const hour = currentTime.hour();

  // Detect shifts spanning midnight by comparing start/end hours (more robust than checking shift code)
  if (shift.start > shift.end) {
    return hour >= shift.start || hour < shift.end;
  }

  return hour >= shift.start && hour < shift.end;
}
