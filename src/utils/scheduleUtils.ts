import { SCHEDULE_OPTIONS, type ScheduleOption, type ScheduleRoster } from "../data/rosters";
import { CONFIG } from "./config";

export function getScheduleConfig(
  scheduleOption: ScheduleOption | null | undefined,
): ScheduleRoster {
  return (
    SCHEDULE_OPTIONS.find((option) => option.value === (scheduleOption ?? "5-shift")) ??
    SCHEDULE_OPTIONS.find((option) => option.value === "5-shift")!
  );
}

export function getTeamCountForOption(scheduleOption: ScheduleOption | null | undefined): number {
  return getScheduleConfig(scheduleOption).shiftConfig.teamCount ?? CONFIG.TEAMS_COUNT;
}
