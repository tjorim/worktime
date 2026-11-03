import type { Dayjs } from "dayjs";
import type { NullableScheduleOption } from "@/utils/shiftCalculations";
import { calculateShift } from "@/utils/shiftCalculations";
import { dayjs } from "@/utils/dateTimeUtils";
import { hasTimeOffEvent, isPublicHolidayForShift } from "@/utils/workingDayUtils";
import type { PublicHolidayInfo } from "@/types/publicHolidays";
import type { TimeOffEntry } from "@/lib/timeOff/types";

export interface WorkingDayOptions {
  team: number | null;
  schedule: NullableScheduleOption;
  holidays: Map<string, PublicHolidayInfo>;
}

/** Scheduled shifts excluding public holidays, using the calendar's night-shift rule. */
export function statisticsWorkingDays(start: Dayjs, end: Dayjs, options: WorkingDayOptions) {
  const days: { date: Dayjs; hours: number }[] = [];
  if (options.team == null) return days;
  for (
    let date = start.startOf("day");
    date.isSameOrBefore(end, "day");
    date = date.add(1, "day")
  ) {
    const shift = calculateShift(date, options.team, options.schedule);
    if (
      !shift.isWorking ||
      shift.start == null ||
      shift.end == null ||
      isPublicHolidayForShift(date, options.team, options.schedule, options.holidays)
    )
      continue;
    days.push({ date, hours: (shift.end - shift.start + 24) % 24 || 24 });
  }
  return days;
}

/** Each half belongs to the first matching entry in the caller's precedence order. */
export function timeOffHalves(date: Dayjs, entries: TimeOffEntry[]) {
  const matching = entries.filter((entry) => hasTimeOffEvent(date, [entry]));
  return ["half_am", "half_pm"].map((half) =>
    matching.find(
      (entry) =>
        entry.entryFlag === half ||
        (entry.entryFlag !== "half_am" && entry.entryFlag !== "half_pm"),
    ),
  );
}

export function calculateAdjustedWeeklyTarget(
  date: string,
  options: WorkingDayOptions,
  entries: TimeOffEntry[],
) {
  const start = dayjs(date).startOf("isoWeek");
  const days = statisticsWorkingDays(start, start.add(6, "day"), options);
  // Informational entries do not excuse working hours.
  const leave = entries.filter(
    (entry) =>
      !["birthday", "in", "business", "course"].includes(entry.entryType) &&
      !["onsite", "no_fly", "can_fly"].includes(entry.entryFlag),
  );
  let weeklyHours = 0;
  for (const day of days) {
    const fraction = timeOffHalves(day.date, leave).filter(Boolean).length / 2;
    weeklyHours += day.hours * (1 - fraction);
  }
  // Keep the scheduled-day denominator so holiday reductions reach the daily chart line too.
  const workingDays = statisticsWorkingDays(start, start.add(6, "day"), {
    ...options,
    holidays: new Map(),
  }).length;
  return { weeklyHours, workingDays };
}
