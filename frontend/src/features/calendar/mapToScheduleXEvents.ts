import type { CalendarEvent, CalendarType } from "@schedule-x/calendar";
import { Temporal } from "temporal-polyfill";
import type { Label } from "@/lib/timeTracking/constants";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import type { TimeOffDateEntry, TimeOffRangeEntry } from "@/lib/timeOff/types";
import { SHIFT_CODES, type ShiftCode } from "@/data/rosters";
import type { Shift, ShiftResult } from "@/utils/shiftCalculations";

export const CALENDAR_COLORS = {
  "time-off": "#198754",
} as const;

/**
 * Mirrors the --wt-shift-* custom properties in styles/_variables.scss so the
 * Unified Calendar's shift blocks match the shift color language used
 * everywhere else (month calendar, shift timeline, schedule table). Schedule-X
 * bakes light/dark colors into its own theme config rather than resolving CSS
 * custom properties at render time, so these must be kept in sync by hand.
 */
const SHIFT_CALENDAR_COLORS: Record<
  ShiftCode,
  { light: string; lightText: string; dark: string; darkText: string }
> = {
  M: { light: "#1976d2", lightText: "#ffffff", dark: "#1565c0", darkText: "#e3f2fd" },
  L: { light: "#bf360c", lightText: "#ffffff", dark: "#8d3200", darkText: "#ffe0b2" },
  D: { light: "#f57c00", lightText: "#111111", dark: "#b85500", darkText: "#ffffff" },
  N: { light: "#7b1fa2", lightText: "#ffffff", dark: "#4527a0", darkText: "#ede7f6" },
  O: { light: "#616161", lightText: "#ffffff", dark: "#616161", darkText: "#ffffff" },
};

type MappableTimeOffEntry = TimeOffDateEntry | TimeOffRangeEntry;
type DatedShift = Pick<ShiftResult, "date" | "shift">;

function createCalendarColors(color: string): CalendarType {
  return {
    colorName: color.replace("#", ""),
    lightColors: { main: color, container: color, onContainer: "#fff" },
    darkColors: { main: color, container: color, onContainer: "#fff" },
  };
}

/** Calendar id for a shift code's Schedule-X calendar, e.g. "shift-M". */
export function shiftCalendarId(code: string): string {
  return `shift-${code}`;
}

function createShiftCalendarColors(code: ShiftCode): CalendarType {
  const colors = SHIFT_CALENDAR_COLORS[code];
  return {
    colorName: shiftCalendarId(code),
    lightColors: { main: colors.light, container: colors.light, onContainer: colors.lightText },
    darkColors: { main: colors.dark, container: colors.dark, onContainer: colors.darkText },
  };
}

/** Build the Schedule-X calendar configuration for shifts, time-off, and task labels. */
export function buildCalendarConfig(labels: Label[]): Record<string, CalendarType> {
  return {
    ...Object.fromEntries(
      SHIFT_CODES.map((code) => [shiftCalendarId(code), createShiftCalendarColors(code)]),
    ),
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
    calendarId: shiftCalendarId(shift.code),
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
