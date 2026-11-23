import type { CalendarEvent, CalendarType } from "@schedule-x/calendar";
import { Temporal } from "temporal-polyfill";
import { getContrastingTextColor, type Label } from "@/lib/time-tracking/constants";
import type { StoredTimeTrackingTask } from "@/lib/time-tracking/types";
import type { TimeOffDateEntry, TimeOffRangeEntry } from "@/lib/time-off/types";
import { SHIFT_CODES, type ShiftCode } from "@/lib/schedule/rosters";
import type { Shift, ShiftResult } from "@/lib/schedule/shiftCalculations";

import {
  EVENT_PALETTE_KEYS,
  getEventColorClass,
  getEventTypeLabel,
  getEventModifierLabel,
} from "@/lib/hday/presentation";
import { getEntryFlagsForDisplay } from "@/lib/time-off/codecs";

/**
 * Mirrors the --wt-shift-* custom properties in styles/tokens.css so the
 * Unified Calendar's shift blocks match the shift color language used
 * everywhere else (month calendar, shift timeline, schedule table).
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
    lightColors: { main: color, container: color, onContainer: getContrastingTextColor(color) },
    darkColors: { main: color, container: color, onContainer: getContrastingTextColor(color) },
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
    ...Object.fromEntries(
      EVENT_PALETTE_KEYS.map((key) => {
        const colorName = `event-${key}`;
        const background = `var(--wt-event-${key}-bg)`;
        const colors = {
          main: background,
          container: background,
          onContainer: `var(--wt-event-${key}-fg)`,
        };
        return [colorName, { colorName, lightColors: colors, darkColors: colors }];
      }),
    ),
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
export function timeOffToEvent(
  entry: MappableTimeOffEntry,
  occurrenceType?: "weekly",
): CalendarEvent {
  const start = entry.entryKind === "date" ? entry.date : entry.start;
  const end = entry.entryKind === "date" ? entry.date : entry.end;

  const flags = getEntryFlagsForDisplay(entry);
  const typeLabel = getEventTypeLabel(flags);
  const modifierLabel = getEventModifierLabel(flags);

  return {
    id: `time-off:${entry.id}`,
    title: [typeLabel, entry.note, modifierLabel].filter(Boolean).join(" · "),
    start: Temporal.PlainDate.from(start),
    end: Temporal.PlainDate.from(end),
    calendarId: getEventColorClass(flags, occurrenceType),
    entryId: entry.id,
    entryTypeLabel: typeLabel,
    entryNote: entry.note,
    entryModifierLabel: modifierLabel,
    _options: { disableDND: true, disableResize: true },
  };
}

/** Map a completed or running task to a timed Schedule-X event. */
export function taskToEvent(
  task: StoredTimeTrackingTask,
  now: Temporal.ZonedDateTime = Temporal.Now.zonedDateTimeISO(),
): CalendarEvent {
  return {
    // The v3 drag plugin uses this ID in an unescaped CSS ID selector.
    id: `task-${task.id}`,
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
