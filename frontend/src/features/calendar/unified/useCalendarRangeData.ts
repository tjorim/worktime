import { useMemo } from "react";
import type { CalendarEvent } from "@schedule-x/calendar";
import { useLiveQuery } from "@tanstack/react-db";
import { timeOffCollection } from "@/lib/db/collections";
import { useSettings } from "@/app/providers/SettingsContext";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import type { StoredTimeTrackingTask } from "@/lib/time-tracking/types";
import type { TimeOffEntry, TimeOffWeeklyEntry } from "@/lib/time-off/types";
import { isTimeOffWeeklyEntry } from "@/lib/time-off/types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { getEffectiveTeam } from "@/lib/schedule/scheduleUtils";
import { calculateShift } from "@/lib/schedule/shiftCalculations";
import {
  isTimedWorkingShift,
  shiftToEvent,
  taskToEvent,
  timeOffToEvent,
} from "@/features/calendar/unified/mapToScheduleXEvents";

export interface CalendarRange {
  start: string;
  end: string;
}

function taskOverlapsRange(task: StoredTimeTrackingTask, range: CalendarRange): boolean {
  const start = dayjs(range.start).startOf("day");
  const end = dayjs(range.end).endOf("day");
  const taskStart = dayjs(task.startTime);
  const taskEnd = task.stopTime ? dayjs(task.stopTime) : dayjs();
  return taskStart.isBefore(end) && taskEnd.isAfter(start);
}

function timeOffOverlapsRange(
  entry: Exclude<TimeOffEntry, TimeOffWeeklyEntry>,
  range: CalendarRange,
) {
  const start = entry.entryKind === "date" ? entry.date : entry.start;
  const end = entry.entryKind === "date" ? entry.date : entry.end;
  return start <= range.end && end >= range.start;
}

function weeklyTimeOffEvents(entry: TimeOffWeeklyEntry, range: CalendarRange): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let date = dayjs(range.start).startOf("day");
  const end = dayjs(range.end).startOf("day");

  while (date.isBefore(end, "day") || date.isSame(end, "day")) {
    if (date.isoWeekday() === entry.weekday) {
      events.push(
        timeOffToEvent(
          {
            ...entry,
            id: `${entry.id}:${date.format("YYYY-MM-DD")}`,
            entryKind: "date",
            date: date.format("YYYY-MM-DD"),
          },
          "weekly",
        ),
      );
    }
    date = date.add(1, "day");
  }

  return events;
}

/** Return Schedule-X-ready shifts, time-off entries, and tasks for an inclusive date range. */
export function useCalendarRangeData(range: CalendarRange): CalendarEvent[] {
  const { tasks } = useTimeTrackingStorage();
  const { data: rawTimeOffEntries } = useLiveQuery(timeOffCollection);
  const { myTeam, scheduleType } = useSettings();

  return useMemo(() => {
    const events: CalendarEvent[] = [];
    const effectiveTeam = scheduleType ? getEffectiveTeam(myTeam, scheduleType) : null;

    if (effectiveTeam !== null && scheduleType) {
      let date = dayjs(range.start).startOf("day");
      const end = dayjs(range.end).startOf("day");
      while (date.isBefore(end, "day") || date.isSame(end, "day")) {
        const shift = calculateShift(date, effectiveTeam, scheduleType);
        if (isTimedWorkingShift(shift)) {
          events.push(shiftToEvent({ date, shift }, effectiveTeam));
        }
        date = date.add(1, "day");
      }
    }

    for (const entry of (rawTimeOffEntries ?? []) as TimeOffEntry[]) {
      if (isTimeOffWeeklyEntry(entry)) {
        events.push(...weeklyTimeOffEvents(entry, range));
      } else if (timeOffOverlapsRange(entry, range)) {
        events.push(timeOffToEvent(entry));
      }
    }

    for (const task of tasks) {
      if (taskOverlapsRange(task, range)) {
        events.push(taskToEvent(task));
      }
    }

    return events;
  }, [myTeam, range, rawTimeOffEntries, scheduleType, tasks]);
}
