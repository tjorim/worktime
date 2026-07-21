import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";

/**
 * Returns the earliest logged task start time (the actual clock-in) for the
 * given day, or `null` when time-tracking is disabled or nothing is logged.
 *
 * Used to anchor the flex-shift finish time to when the user actually started,
 * instead of the nominal roster start.
 */
export function useTodayActualStart(day: Dayjs): Dayjs | null {
  const { settings } = useSettings();
  const { tasks } = useTimeTrackingStorage();
  const dayKey = day.format("YYYY-MM-DD");

  return useMemo(() => {
    if (!settings.enableTimeTracking) return null;
    let earliest: Dayjs | null = null;
    for (const task of tasks) {
      const start = dayjs(task.startTime);
      if (!start.isValid() || start.format("YYYY-MM-DD") !== dayKey) continue;
      if (!earliest || start.isBefore(earliest)) earliest = start;
    }
    return earliest;
  }, [tasks, settings.enableTimeTracking, dayKey]);
}
