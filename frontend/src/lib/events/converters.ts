/**
 * Event conversion utilities for Worktime calendar system
 *
 * Converts between three event models:
 * 1. **ShiftResult** - Team shift assignments from shift calculations
 * 2. **HdayEvent** - Time-off events from .hday parser (range/weekly/unknown)
 * 3. **CalendarEvent** - Unified calendar model for rendering
 *
 * ## One-Way Conversions
 *
 * - ShiftResult → CalendarEvent (for shift display)
 * - HdayEvent → CalendarEvent[] (for time-off overlays)
 *
 * There is NO reverse conversion (CalendarEvent → HdayEvent) because the
 * source .hday text is preserved in EventStoreContext for round-trip fidelity.
 *
 * ## Performance Warning
 *
 * **Weekly events**: Generating occurrences for large date ranges can be slow.
 * A 1-year range generates ~52 events per weekly rule. For large ranges:
 * - Limit the date window (e.g., current month ± 3 months)
 * - Use virtual scrolling for event lists
 * - Memoize conversion results in React components
 *
 * @module lib/events/converters
 */

import { v4 as uuidv4 } from "uuid";
import type { ShiftResult } from "../../utils/shiftCalculations";
import { dayjs, splitFractionalHour, pad2 } from "../../utils/dateTimeUtils";
import type { HdayEvent } from "../hday/types";
import { getEventColor, getEventTypeLabel, getTimeLocationSymbol } from "../hday/parser";
import type { CalendarEvent, HolidayMetadata, ShiftMetadata } from "./types";

/**
 * Convert a ShiftResult to a CalendarEvent
 *
 * Off-days (shift code 'O') are converted with null start/end times.
 * Each call generates a new UUID for the event.
 *
 * @param shift - The shift result from shift calculations
 * @returns CalendarEvent representing the shift
 *
 * @example
 * // Convert a morning shift for Team 1
 * const shiftResult = {
 *   date: dayjs('2025-01-06'),
 *   shift: SHIFTS.MORNING,
 *   code: '2502.1M',
 *   teamNumber: 1
 * };
 * shiftToCalendarEvent(shiftResult)
 * // Returns: {
 * //   id: '...uuid...',
 * //   type: 'shift',
 * //   start: '2025-01-06',
 * //   end: '2025-01-06',
 * //   label: 'Morning (T1)',
 * //   meta: { type: 'shift', team: 1, shiftCode: 'M', startTime: '07:00', endTime: '15:00', className: 'shift-morning' }
 * // }
 *
 * @example
 * // Off-day shift has null times
 * const offDay = { date: dayjs('2025-01-07'), shift: SHIFTS.OFF, code: '2502.2O', teamNumber: 1 };
 * shiftToCalendarEvent(offDay).meta.startTime // undefined
 * shiftToCalendarEvent(offDay).meta.endTime   // undefined
 */
export function shiftToCalendarEvent(shift: ShiftResult): CalendarEvent {
  const dateStr = shift.date.format("YYYY-MM-DD");

  // Format fractional hours like 6.5 to "06:30" instead of "6.5:00"
  const formatShiftTime = (fractionalHour: number): string => {
    const { hours, minutes } = splitFractionalHour(fractionalHour);
    return `${pad2(hours)}:${pad2(minutes)}`;
  };

  const meta: ShiftMetadata = {
    type: "shift",
    team: shift.teamNumber,
    shiftCode: shift.shift.code as "M" | "L" | "N" | "D" | "O",
    startTime: shift.shift.start !== null ? formatShiftTime(shift.shift.start) : undefined,
    endTime: shift.shift.end !== null ? formatShiftTime(shift.shift.end) : undefined,
    className: shift.shift.className,
  };

  return {
    id: uuidv4(),
    type: "shift",
    start: dateStr,
    end: dateStr,
    label: `${shift.shift.name} (T${shift.teamNumber})`,
    meta,
  };
}

/**
 * Convert an HdayEvent to CalendarEvent(s)
 *
 * **Event Expansion:**
 * - Range events → 1 CalendarEvent
 * - Weekly events → N CalendarEvents (one per matching weekday in range)
 * - Unknown events → empty array (ignored for calendar display)
 *
 * **Performance Warning:**
 * Weekly events iterate day-by-day through the date range. For a 1-year range,
 * a single weekly event generates ~52 calendar events. With 10 weekly rules,
 * that's 520 events. Use reasonable date windows (e.g., ±3 months from today).
 *
 * @param event - The .hday event to convert
 * @param startDate - Start of date range (for weekly event generation)
 * @param endDate - End of date range (for weekly event generation)
 * @param sourceIndex - Original index in the .hday events array (for CRUD operations)
 * @returns Array of CalendarEvent(s)
 *
 * @example
 * // Range event produces one calendar event
 * const rangeEvent = { type: 'range', start: '2025/01/15', end: '2025/01/17', flags: ['holiday'], title: 'Vacation' };
 * hdayToCalendarEvents(rangeEvent, new Date('2025-01-01'), new Date('2025-12-31'))
 * // Returns: [{ id: '...', type: 'holiday', start: '2025-01-15', end: '2025-01-17', label: 'Vacation', meta: {...} }]
 *
 * @example
 * // Weekly event produces multiple calendar events (one per occurrence)
 * const weeklyEvent = { type: 'weekly', weekday: 1, flags: ['in'], title: 'Office Monday' };
 * hdayToCalendarEvents(weeklyEvent, new Date('2025-01-06'), new Date('2025-01-20'))
 * // Returns: [
 * //   { id: '...', type: 'holiday', start: '2025-01-06', end: '2025-01-06', label: 'Office Monday', meta: {...} },
 * //   { id: '...', type: 'holiday', start: '2025-01-13', end: '2025-01-13', label: 'Office Monday', meta: {...} },
 * //   { id: '...', type: 'holiday', start: '2025-01-20', end: '2025-01-20', label: 'Office Monday', meta: {...} }
 * // ]
 *
 * @example
 * // Unknown events are ignored
 * const unknownEvent = { type: 'unknown', raw: 'malformed line', flags: ['holiday'] };
 * hdayToCalendarEvents(unknownEvent, new Date('2025-01-01'), new Date('2025-12-31'))
 * // Returns: [] (empty array)
 *
 * @see parseHday For parsing .hday text into HdayEvent objects
 */
export function hdayToCalendarEvents(
  event: HdayEvent,
  startDate: Date,
  endDate: Date,
  sourceIndex?: number,
): CalendarEvent[] {
  if (event.type === "range") {
    return [hdayRangeToCalendarEvent(event, sourceIndex)];
  }

  if (event.type === "weekly") {
    return hdayWeeklyToCalendarEvents(event, startDate, endDate, sourceIndex);
  }

  // Unknown events are not rendered as calendar events
  return [];
}

/**
 * Create a CalendarEvent representing a range-type HdayEvent.
 *
 * Converts the given range HdayEvent into a single holiday CalendarEvent and
 * attaches derived holiday metadata.
 *
 * @param event - The range HdayEvent; must include `start` and `end` date strings.
 * @param sourceIndex - Optional index mapping this event back to its source (used for CRUD/source tracking).
 * @returns A CalendarEvent that covers the event's start–end range with holiday metadata.
 * @throws {Error} If `event.start` or `event.end` is missing.
 *
 * @example
 * // Convert a multi-day business trip
 * const event = {
 *   type: 'range',
 *   start: '2025/03/10',
 *   end: '2025/03/14',
 *   flags: ['business', 'half_am'],
 *   title: 'Conference'
 * };
 * hdayRangeToCalendarEvent(event, 0)
 * // Returns: {
 * //   id: '...uuid...',
 * //   type: 'holiday',
 * //   start: '2025-03-10',
 * //   end: '2025-03-14',
 * //   label: 'Conference',
 * //   meta: { type: 'holiday', color: '#FFC04D', flags: ['business', 'half_am'], typeLabel: 'Business', symbol: 'a', sourceIndex: 0 }
 * // }
 */
function hdayRangeToCalendarEvent(event: HdayEvent, sourceIndex?: number): CalendarEvent {
  if (!event.start || !event.end) {
    throw new Error("Range event missing start or end date");
  }

  // Convert YYYY/MM/DD to YYYY-MM-DD (ISO format)
  const start = event.start.replace(/\//g, "-");
  const end = event.end.replace(/\//g, "-");

  const flags = event.flags || [];
  const color = getEventColor(flags);
  const typeLabel = getEventTypeLabel(flags);
  const symbol = getTimeLocationSymbol(flags);

  const meta: HolidayMetadata = {
    type: "holiday",
    color,
    flags,
    typeLabel,
    symbol,
    sourceIndex,
  };

  return {
    id: uuidv4(),
    type: "holiday",
    start,
    end,
    label: event.title || typeLabel,
    meta,
  };
}

/**
 * Create calendar events for each weekly occurrence of an HdayEvent within the inclusive date range.
 *
 * @param event - The weekly HdayEvent; its `weekday` determines which weekday to generate events for
 * @param startDate - Start of the inclusive date range to search for occurrences
 * @param endDate - End of the inclusive date range to search for occurrences
 * @param sourceIndex - Optional source index to include in each event's metadata for reverse mapping
 * @returns An array of calendar events, one for each occurrence of the event's weekday between `startDate` and `endDate` (inclusive)
 * @throws {Error} If `event.weekday` is undefined
 *
 * @example
 * // Generate calendar events for "every Friday in office"
 * const event = {
 *   type: 'weekly',
 *   weekday: 5, // Friday
 *   flags: ['in', 'half_am'],
 *   title: 'Office Friday AM'
 * };
 * hdayWeeklyToCalendarEvents(event, new Date('2025-01-01'), new Date('2025-01-31'), 2)
 * // Returns: [
 * //   { id: '...', type: 'holiday', start: '2025-01-03', end: '2025-01-03', label: 'Office Friday AM', meta: {...} },
 * //   { id: '...', type: 'holiday', start: '2025-01-10', end: '2025-01-10', label: 'Office Friday AM', meta: {...} },
 * //   { id: '...', type: 'holiday', start: '2025-01-17', end: '2025-01-17', label: 'Office Friday AM', meta: {...} },
 * //   { id: '...', type: 'holiday', start: '2025-01-24', end: '2025-01-24', label: 'Office Friday AM', meta: {...} },
 * //   { id: '...', type: 'holiday', start: '2025-01-31', end: '2025-01-31', label: 'Office Friday AM', meta: {...} }
 * // ]
 */
function hdayWeeklyToCalendarEvents(
  event: HdayEvent,
  startDate: Date,
  endDate: Date,
  sourceIndex?: number,
): CalendarEvent[] {
  if (event.weekday === undefined) {
    throw new Error("Weekly event missing weekday");
  }

  const events: CalendarEvent[] = [];
  const flags = event.flags || [];
  const color = getEventColor(flags);
  const typeLabel = getEventTypeLabel(flags);
  const symbol = getTimeLocationSymbol(flags);

  // Generate occurrences for each matching weekday in the date range
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  // Find first occurrence of the target weekday
  while (current.isoWeekday() !== event.weekday && current.isBefore(end, "day")) {
    current = current.add(1, "day");
  }

  // Generate events for all occurrences
  while (current.isBefore(end, "day") || current.isSame(end, "day")) {
    const dateStr = current.format("YYYY-MM-DD");

    const meta: HolidayMetadata = {
      type: "holiday",
      color,
      flags,
      typeLabel,
      symbol,
      sourceIndex,
    };

    events.push({
      id: uuidv4(),
      type: "holiday",
      start: dateStr,
      end: dateStr,
      label: event.title || typeLabel,
      meta,
    });

    current = current.add(7, "days"); // Next week
  }

  return events;
}

/**
 * Filter CalendarEvents to those within a date range (inclusive)
 *
 * @param events - Array of calendar events to filter
 * @param startDate - Start of date range (YYYY-MM-DD)
 * @param endDate - End of date range (YYYY-MM-DD)
 * @returns Filtered array of events
 */
export function filterEventsInRange(
  events: CalendarEvent[],
  startDate: string,
  endDate: string,
): CalendarEvent[] {
  const start = dayjs(startDate);
  const end = dayjs(endDate);

  return events.filter((event) => {
    const eventStart = dayjs(event.start);
    const eventEnd = dayjs(event.end);

    // Event overlaps with range if:
    // - Event starts before or on range end AND
    // - Event ends after or on range start
    return (
      (eventStart.isBefore(end, "day") || eventStart.isSame(end, "day")) &&
      (eventEnd.isAfter(start, "day") || eventEnd.isSame(start, "day"))
    );
  });
}
