import { SCHEDULE_OPTIONS, type ScheduleOption, type ScheduleRoster } from "../data/rosters";
import { CONFIG } from "./config";

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
  return getScheduleConfig(scheduleOption).shiftConfig.teamCount ?? CONFIG.TEAMS_COUNT;
}
