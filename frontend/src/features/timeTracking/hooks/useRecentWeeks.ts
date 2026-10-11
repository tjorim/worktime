import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import { effectiveDurationHours } from "@/lib/timeTracking/timeUtils";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

export const RECENT_WEEKS_COUNT = 8;

export type RecentWeekDay = {
  iso: string;
  hours: number;
  /** Zero-based Monday-first weekday index. */
  weekday: number;
};

export type RecentWeek = {
  /** ISO date of the week's Monday. */
  start: string;
  isoWeek: number;
  hours: number;
  days: RecentWeekDay[];
};

/**
 * Hours per day for the `count` ISO weeks ending with the week of `endDate`, oldest first.
 * Running tasks count up to `now`, matching the weekly summary.
 */
export function buildRecentWeeks(
  tasks: StoredTimeTrackingTask[],
  endDate: string,
  now: Dayjs,
  count: number = RECENT_WEEKS_COUNT,
): RecentWeek[] {
  const lastStart = dayjs(endDate).startOf("isoWeek");
  const firstStart = lastStart.subtract(count - 1, "week");
  const rangeStart = firstStart.format("YYYY-MM-DD");
  const rangeEnd = lastStart.add(6, "day").format("YYYY-MM-DD");

  const hoursByDay = new Map<string, number>();
  for (const task of tasks) {
    const date = task.startTime.substring(0, 10);
    if (date < rangeStart || date > rangeEnd) continue;
    const stop = task.stopTime ? dayjs(task.stopTime) : now;
    const rawHours = Math.max(stop.diff(dayjs(task.startTime), "hour", true), 0);
    hoursByDay.set(
      date,
      (hoursByDay.get(date) ?? 0) + effectiveDurationHours(rawHours, task.includesBreak),
    );
  }

  return Array.from({ length: count }, (_, weekIndex) => {
    const weekStart = firstStart.add(weekIndex, "week");
    const days = Array.from({ length: 7 }, (_, weekday): RecentWeekDay => {
      const iso = weekStart.add(weekday, "day").format("YYYY-MM-DD");
      return { iso, weekday, hours: hoursByDay.get(iso) ?? 0 };
    });
    return {
      start: weekStart.format("YYYY-MM-DD"),
      isoWeek: weekStart.isoWeek(),
      hours: days.reduce((sum, day) => sum + day.hours, 0),
      days,
    };
  });
}

export function useRecentWeeks(
  tasks: StoredTimeTrackingTask[],
  endDate: string,
  now: Dayjs,
  count: number = RECENT_WEEKS_COUNT,
): RecentWeek[] {
  return useMemo(() => buildRecentWeeks(tasks, endDate, now, count), [tasks, endDate, now, count]);
}
