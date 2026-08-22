import { dayjs } from "@/utils/dateTimeUtils";
import { BREAK_DURATION_MINUTES } from "@/lib/timeTracking/timeUtils";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import * as m from "@/paraglide/messages.js";

export function getLoggedMinutes(
  startTime: string,
  stopTime: string | null | undefined,
  includesBreak?: boolean,
): number {
  const stop = stopTime ? dayjs(stopTime) : dayjs();
  const rawMinutes = Math.max(0, stop.diff(dayjs(startTime), "minute"));
  return Math.max(0, rawMinutes - (includesBreak ? BREAK_DURATION_MINUTES : 0));
}

export function formatLoggedDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return m.gantt_logged_minutes({ minutes: remainingMinutes });
  if (remainingMinutes === 0) return m.gantt_logged_hours({ hours });
  return m.gantt_logged_hours_minutes({ hours, minutes: remainingMinutes });
}

export function getLoggedMinutesByTaskId(entries: StoredTimeTrackingTask[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry.ganttTaskId) {
      const minutes = getLoggedMinutes(entry.startTime, entry.stopTime, entry.includesBreak);
      map.set(entry.ganttTaskId, (map.get(entry.ganttTaskId) ?? 0) + minutes);
    }
  }
  return map;
}
