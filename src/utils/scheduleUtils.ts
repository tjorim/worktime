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
