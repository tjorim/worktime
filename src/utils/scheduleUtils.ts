import { SCHEDULE_OPTIONS, type ScheduleOption, type ScheduleRoster } from "../data/rosters";

export function getScheduleConfig(
  scheduleOption: ScheduleOption | null | undefined,
): ScheduleRoster {
  const lookupKey = scheduleOption ?? "5-shift";
  const config = SCHEDULE_OPTIONS.find((option) => option.value === lookupKey);

  if (!config) {
    // This error can be reached if scheduleOption is invalid or if the default '5-shift' is missing
    throw new Error(
      `Schedule configuration not found (provided: ${scheduleOption}, lookup: '${lookupKey}'). ` +
        `Available options: ${SCHEDULE_OPTIONS.map((o) => o.value).join(", ")}`,
    );
  }

  return config;
}

export function getTeamCountForOption(scheduleOption: ScheduleOption | null | undefined): number {
  const config = getScheduleConfig(scheduleOption);
  if (config.shiftConfig.teamCount === undefined) {
    throw new Error(`teamCount not defined for schedule ${config.value}`);
  }
  return config.shiftConfig.teamCount;
}

/**
 * Get the effective team number for the user, handling single-user schedules.
 *
 * For schedules where `showsTeamSelection` is false (single-user schedules like '9-5'),
 * always returns 1, since the user is the only person on the schedule and team selection
 * is not shown or used.
 * For multi-team schedules, validates the team number is within the valid range.
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
  const showsTeamSelection = config.showsTeamSelection ?? true;
  const teamCount = config.shiftConfig.teamCount;

  if (teamCount === undefined) {
    throw new Error(`teamCount not defined for schedule ${config.value}`);
  }

  // For single-user schedules, always return team 1
  if (!showsTeamSelection) {
    return 1;
  }

  // For multi-team schedules, validate the team number
  if (myTeam === null) {
    return null;
  }

  if (typeof myTeam !== "number" || myTeam < 1 || myTeam > teamCount) {
    console.warn(`Invalid team number ${myTeam} (expected 1-${teamCount}). Treating as null.`);
    return null;
  }

  return myTeam;
}
