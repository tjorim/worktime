import type { Dayjs } from "dayjs";
import { dayjs } from "@/utils/dateTimeUtils";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import { logger } from "@/utils/logger";
/**
 * Mandatory break duration in minutes. Per labor law, employees working more
 * than 5 hours must take a 30-minute break that is automatically deducted
 * from their logged time.
 */
export const BREAK_DURATION_MINUTES = 30;

/** Lunch window start in minutes from midnight (11:30). */
const LUNCH_WINDOW_START = 11 * 60 + 30; // 690

/** Lunch window end in minutes from midnight (13:30). */
const LUNCH_WINDOW_END = 13 * 60 + 30; // 810

/**
 * Returns the effective duration in hours for a task, subtracting the
 * mandatory break when `includesBreak` is true. The deduction is capped
 * at the raw duration so the result never goes negative.
 */
export function effectiveDurationHours(rawHours: number, includesBreak?: boolean): number {
  if (!includesBreak) return rawHours;
  const deduction = BREAK_DURATION_MINUTES / 60;
  return Math.max(rawHours - deduction, 0);
}

/** Actual elapsed hours only: scheduled stops cannot contribute future time.
 * Keep the existing break policy for completed, scheduled and running tasks.
 */
export function actualTaskDurationHours(task: StoredTimeTrackingTask, now: Dayjs): number {
  const stop = task.stopTime ? dayjs(task.stopTime) : now;
  const elapsedStop = stop.isAfter(now) ? now : stop;
  const rawHours = Math.max(elapsedStop.diff(dayjs(task.startTime), "hour", true), 0);
  return effectiveDurationHours(rawHours, task.includesBreak);
}

/**
 * Calculates the position of the break within a task's time range, based on
 * the staff guide lunch window (11:30-13:30).
 *
 * Returns three durations in hours: work before the break, the break itself,
 * and work after the break. The break is clamped to where the task overlaps
 * the lunch window. If there is no overlap the break is placed at the edge
 * closest to the window.
 */
export function calculateBreakPosition(
  taskStartMinutes: number,
  taskStopMinutes: number,
): { beforeHours: number; breakHours: number; afterHours: number } {
  const taskDuration = taskStopMinutes - taskStartMinutes;
  if (taskDuration <= 0) {
    return { beforeHours: 0, breakHours: 0, afterHours: 0 };
  }

  const breakDuration = Math.min(BREAK_DURATION_MINUTES, taskDuration);

  // Determine break start: clamp to the lunch window, then to the task range.
  // The break should start at the latest of (task start, lunch window start),
  // but no later than (task end - break duration) so it fits.
  let breakStart: number;

  if (taskStopMinutes <= LUNCH_WINDOW_START) {
    // Task ends before the lunch window — place break at the end
    breakStart = taskStopMinutes - breakDuration;
  } else if (taskStartMinutes >= LUNCH_WINDOW_END) {
    // Task starts after the lunch window — place break at the start
    breakStart = taskStartMinutes;
  } else {
    // Task overlaps the lunch window
    breakStart = Math.max(taskStartMinutes, LUNCH_WINDOW_START);
    // Ensure the break fits within the task
    breakStart = Math.min(breakStart, taskStopMinutes - breakDuration);
  }

  // Clamp to task bounds
  breakStart = Math.max(breakStart, taskStartMinutes);

  const beforeMinutes = breakStart - taskStartMinutes;
  const afterMinutes = taskStopMinutes - (breakStart + breakDuration);

  return {
    beforeHours: beforeMinutes / 60,
    breakHours: breakDuration / 60,
    afterHours: Math.max(afterMinutes, 0) / 60,
  };
}

export function timeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid time format "${time}". Expected HH:MM.`);
  }
  const [hoursRaw, minutesRaw] = parts.map((segment) => segment.trim());

  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!hoursRaw || !minutesRaw || Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time value "${time}". Expected numeric hours and minutes.`);
  }
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60) {
    throw new Error(`Invalid time value "${time}". Hours must be 0-23 and minutes must be 0-59.`);
  }
  return hours * 60 + minutes;
}

export function isValidRange(start: string, stop: string): boolean {
  try {
    return timeToMinutes(stop) !== timeToMinutes(start);
  } catch {
    return false;
  }
}

export function calculateDurationHours(start: string, stop: string): number {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  if (stopMin === startMin) return 0;
  return ((stopMin - startMin + 1440) % 1440) / 60;
}

/**
 * Returns true when the string looks like a valid HH:MM time value.
 */
export function isValidTimeString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    timeToMinutes(value);
    return true;
  } catch {
    return false;
  }
}

function segmentsOverlap(aStart: number, aStop: number, bStart: number, bStop: number): boolean {
  return aStart < bStop && aStop > bStart;
}

export function overlaps(
  start: string,
  stop: string,
  tasks: { id: string; start: string; stop: string }[],
  skipId?: string,
): boolean {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  if (stopMin <= startMin) {
    return false;
  }

  return tasks.some((task) => {
    if (skipId && task.id === skipId) {
      return false;
    }
    try {
      const taskStart = timeToMinutes(task.start);
      const taskStop = timeToMinutes(task.stop);
      if (taskStop <= taskStart) {
        return false;
      }
      return segmentsOverlap(startMin, stopMin, taskStart, taskStop);
    } catch (error) {
      logger.warn(`Failed to parse task times for task ${task.id}:`, task, error);
      return false;
    }
  });
}

/** Resolve an earlier stop clock time on the following calendar day, including DST. */
export function taskStopTime(date: string, start: string, stop: string): string {
  const stopDate = stop < start ? dayjs(date).add(1, "day").format("YYYY-MM-DD") : date;
  return `${stopDate}T${stop}`;
}

/** Compare complete intervals across day boundaries; adjacent tasks are allowed. */
export function overlapsTaskInterval(
  start: string,
  stop: string,
  tasks: StoredTimeTrackingTask[],
  skipId?: string,
  now = dayjs(),
): boolean {
  const from = dayjs(start).valueOf();
  const until = dayjs(stop).valueOf();
  return tasks.some((task) => {
    if (task.id === skipId) return false;
    const taskStart = dayjs(task.startTime).valueOf();
    const taskStop = task.stopTime
      ? dayjs(task.stopTime).valueOf()
      : Math.max(taskStart, now.valueOf());
    return from < until && taskStart < taskStop && from < taskStop && until > taskStart;
  });
}

/** Keep local writes within the server's elapsed-duration limit. */
export function isValidTaskInterval(start: string, stop: string): boolean {
  const duration = dayjs(stop).diff(dayjs(start), "hour", true);
  return duration > 0 && duration <= 24;
}
