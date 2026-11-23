import { dayjs, formatDuration } from "@/lib/dates/dateTimeUtils";
import { BREAK_DURATION_MINUTES } from "@/lib/time-tracking/timeUtils";
import type { StoredTimeTrackingTask } from "@/lib/time-tracking/types";

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
  return formatDuration(minutes * 60);
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
