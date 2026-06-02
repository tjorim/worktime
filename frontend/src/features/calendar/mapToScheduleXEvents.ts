import type { CalendarEvent, CalendarType } from "@schedule-x/calendar";
import { Temporal } from "temporal-polyfill";
import type { TimeTrackingLabel } from "@/components/timeTracking/constants";
import type { StoredTimeTrackingTask } from "@/components/timeTracking/types";
import type { TimeOffDateEntry, TimeOffRangeEntry } from "@/lib/timeOff/types";
import type { Shift, ShiftResult } from "@/utils/shiftCalculations";

export const CALENDAR_COLORS = {
  shift: "#0d6efd",
  "time-off": "#198754",
} as const;

type MappableTimeOffEntry = TimeOffDateEntry | TimeOffRangeEntry;
type DatedShift = Pick<ShiftResult, "date" | "shift">;

function createCalendarColors(color: string): CalendarType {
  return {
    colorName: color.replace("#", ""),
    lightColors: { main: color, container: color, onContainer: "#fff" },
    darkColors: { main: color, container: color, onContainer: "#fff" },
  };
}

/** Build the Schedule-X calendar configuration for shifts, time-off, and task labels. */
export function buildCalendarConfig(labels: TimeTrackingLabel[]): Record<string, CalendarType> {
  return {
    shift: createCalendarColors(CALENDAR_COLORS.shift),
    "time-off": createCalendarColors(CALENDAR_COLORS["time-off"]),
    ...Object.fromEntries(labels.map((label) => [label.id, createCalendarColors(label.color)])),
  };
}

function getLocalTimezone(): string {
  return Temporal.Now.timeZoneId();
}

function toZonedDateTime(value: string): Temporal.ZonedDateTime {
  return Temporal.PlainDateTime.from(value).toZonedDateTime(getLocalTimezone());
}

function formatHour(hour: number): string {
  const hours = Math.floor(hour);
  const minutes = Math.round((hour - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function shiftDateTime(date: string, hour: number): Temporal.ZonedDateTime {
  if (hour === 24) {
    return toZonedDateTime(`${date}T00:00`).add({ days: 1 });
  }
  return toZonedDateTime(`${date}T${formatHour(hour)}`);
}

/** Map a client-computed working shift to a timed Schedule-X event. */
export function shiftToEvent(datedShift: DatedShift, team: number): CalendarEvent {
  const { date, shift } = datedShift;
  if (!shift.isWorking || shift.start === null || shift.end === null) {
    throw new Error("Only timed working shifts can be mapped to Schedule-X events");
  }

  const start = shiftDateTime(date.format("YYYY-MM-DD"), shift.start);
  let end = shiftDateTime(date.format("YYYY-MM-DD"), shift.end);
  if (Temporal.ZonedDateTime.compare(end, start) <= 0) {
    end = end.add({ days: 1 });
  }

  return {
    id: `shift:${team}:${date.format("YYYY-MM-DD")}`,
    title: shift.name,
    start,
    end,
    calendarId: "shift",
    shiftCode: shift.code,
    team,
    _options: { disableDND: true, disableResize: true },
  };
}

/** Map a concrete date or range time-off entry to an all-day Schedule-X event. */
export function timeOffToEvent(entry: MappableTimeOffEntry): CalendarEvent {
  const start = entry.entryKind === "date" ? entry.date : entry.start;
  const end = entry.entryKind === "date" ? entry.date : entry.end;

  return {
    id: `time-off:${entry.id}`,
    title: entry.note ?? entry.entryType,
    start: Temporal.PlainDate.from(start),
    end: Temporal.PlainDate.from(end).add({ days: 1 }),
    calendarId: "time-off",
    entryId: entry.id,
    entryFlag: entry.entryFlag,
    entryType: entry.entryType,
    _options: { disableDND: true, disableResize: true },
  };
}

/** Map a completed or running task to a timed Schedule-X event. */
export function taskToEvent(
  task: StoredTimeTrackingTask,
  now: Temporal.ZonedDateTime = Temporal.Now.zonedDateTimeISO(),
): CalendarEvent {
  return {
    id: `task:${task.id}`,
    title: task.text,
    start: toZonedDateTime(task.startTime),
    end: task.stopTime ? toZonedDateTime(task.stopTime) : now,
    calendarId: task.label,
    taskId: task.id,
    isRunning: !task.stopTime,
  };
}

export function isTimedWorkingShift(shift: Shift): boolean {
  return shift.isWorking && shift.start !== null && shift.end !== null;
}
