import { SCHEDULE_OPTIONS, type ScheduleOption, type ScheduleRoster } from "@/data/rosters";
import { logger } from "@/utils/logger";

const SCHEDULE_MAP = new Map<string, ScheduleRoster>(
  SCHEDULE_OPTIONS.map((option) => [option.value, option]),
);

/**
 * Type guard to check if a value is a valid ScheduleOption.
 * Useful for runtime validation of user input or localStorage data.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ScheduleOption
 *
 * @example
 * const userInput = localStorage.getItem("schedule");
 * if (isValidScheduleType(userInput)) {
 *   // TypeScript now knows userInput is ScheduleOption
 *   const config = getScheduleConfig(userInput);
 * }
 */
export function isValidScheduleType(value: unknown): value is ScheduleOption {
  if (typeof value !== "string") return false;
  return SCHEDULE_MAP.has(value);
}

/**
 * Get the roster configuration for a given schedule option.
 *
 * **Default Behavior**: Falls back to "5-shift" when scheduleOption is null/undefined.
 * This fallback exists for backward compatibility with existing user data from before
 * the schedule selection feature was introduced. New users are required to explicitly
 * select a schedule during onboarding, but existing users may have null in localStorage.
 *
 * @param scheduleOption - The schedule option to look up, or null/undefined to use the default
 * @returns The roster configuration for the schedule
 * @throws {Error} If the schedule option is not found in SCHEDULE_OPTIONS
 *
 * @example
 * // Explicit schedule lookup
 * const config = getScheduleConfig("9-5");
 *
 * @example
 * // Fallback to default for backward compatibility
 * const config = getScheduleConfig(null); // Returns "5-shift" config
 */
export function getScheduleConfig(
  scheduleOption: ScheduleOption | null | undefined,
): ScheduleRoster {
  // Fallback to "5-shift" for backward compatibility with pre-schedule-selection user data.
  // New users must explicitly select a schedule during onboarding (see WelcomeWizard).
  const lookupKey = scheduleOption ?? "5-shift";
  const config = SCHEDULE_MAP.get(lookupKey);

  if (!config) {
    // This error can be reached if scheduleOption is invalid or if the default '5-shift' is missing
    throw new Error(
      `Schedule configuration not found (provided: ${scheduleOption}, lookup: '${lookupKey}'). ` +
        `Available options: ${SCHEDULE_OPTIONS.map((o) => o.value).join(", ")}`,
    );
  }

  return config;
}

export function isFiveShiftSchedule(scheduleOption: ScheduleOption | null | undefined): boolean {
  return getScheduleConfig(scheduleOption).value === "5-shift";
}

export function getTeamCountForOption(scheduleOption: ScheduleOption | null | undefined): number {
  const config = getScheduleConfig(scheduleOption);
  if (config.shiftConfig.teamCount === undefined) {
    throw new Error(`teamCount not defined for schedule ${config.value}`);
  }
  return config.shiftConfig.teamCount;
}

export function hasMultipleTeams(scheduleOption: ScheduleOption | null | undefined): boolean {
  return getTeamCountForOption(scheduleOption) > 1;
}

/**
 * Get the effective team number for the user, handling single-user schedules.
 *
 * For schedules with teamCount === 1 (single-user schedules like '9-5'),
 * always returns 1, since there's only one person on the schedule.
 * For multi-team schedules (including those with hidden team selection like '2-shift'),
 * validates the team number is within the valid range.
 *
 * @param myTeam - The user's selected team number or null
 * @param scheduleOption - The selected schedule option
 * @returns The effective team number (always 1 for single-user schedules; for multi-team schedules, the validated team number or null if invalid)
 */
export function getEffectiveTeam(
  myTeam: number | null,
  scheduleOption: ScheduleOption | null | undefined,
): number | null {
  const config = getScheduleConfig(scheduleOption);
  const teamCount = config.shiftConfig.teamCount;

  if (teamCount === undefined) {
    throw new Error(`teamCount not defined for schedule ${config.value}`);
  }

  // For single-user schedules (teamCount === 1), always return team 1
  // This handles schedules like "9-5" where there's only one person
  if (teamCount === 1) {
    return 1;
  }

  // For multi-team schedules, validate the team number
  // This includes schedules with hidden team selection (e.g., "2-shift", "weekend-shift")
  if (myTeam === null) {
    return null;
  }

  if (myTeam < 1 || myTeam > teamCount) {
    logger.warn(`Invalid team number ${myTeam} (expected 1-${teamCount}). Treating as null.`);
    return null;
  }

  return myTeam;
}

