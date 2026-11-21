import { useMemo } from "react";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import type { StoredTimeTrackingTask } from "@/lib/time-tracking/types";

export function useDailyTaskSummary(tasks: StoredTimeTrackingTask[], date: string) {
  const dailyTasks = useMemo(
    () =>
      tasks
        .filter((task) => dayjs(task.startTime).format("YYYY-MM-DD") === date)
        .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
    [tasks, date],
  );

  const runningTask = useMemo(
    () =>
      tasks.reduce<StoredTimeTrackingTask | null>((latest, task) => {
        if (task.stopTime === undefined || task.stopTime === null) {
          if (!latest || task.startTime > latest.startTime) {
            return task;
          }
        }
        return latest;
      }, null),
    [tasks],
  );

  return { dailyTasks, runningTask };
}
