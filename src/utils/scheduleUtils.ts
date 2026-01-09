import { SCHEDULE_OPTIONS, type ScheduleOption, type ScheduleRoster } from "../data/rosters";

export function getScheduleConfig(
  scheduleOption: ScheduleOption | null | undefined,
): ScheduleRoster {
  const config =
    SCHEDULE_OPTIONS.find((option) => option.value === (scheduleOption ?? "5-shift")) ??
    SCHEDULE_OPTIONS.find((option) => option.value === "5-shift");

  if (!config) {
    // This should be a critical failure, as the default is missing.
    throw new Error("Default '5-shift' schedule configuration is missing.");
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
