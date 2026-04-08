/**
 * Unified event model for Worktime
 *
 * Bridges between shift calculations and .hday time-off events,
 * providing a common interface for calendar display.
 */

/**
 * Event type discriminator
 * - shift: Team shift event (from shift calculations)
 * - holiday: Time-off event (from .hday files)
 * - assignment: Custom assignment/note (future expansion)
 */
export type EventType = "shift" | "holiday" | "assignment";

/**
 * Unified calendar event interface
 *
 * All events (shifts, holidays, assignments) are normalized to this format
 * for consistent rendering and querying across the application.
 */
interface CalendarEventBase {
  /** Unique identifier (UUID v4) for React keys and references */
  id: string;

  /** Start date in ISO format (YYYY-MM-DD) */
  start: string;

  /** End date in ISO format (YYYY-MM-DD) - inclusive */
  end: string;

  /** Display label for the event */
  label?: string;
}

export interface ShiftEvent extends CalendarEventBase {
  type: "shift";
  meta: ShiftMetadata;
}

export interface HolidayEvent extends CalendarEventBase {
  type: "holiday";
  meta: HolidayMetadata;
}

export interface AssignmentEvent extends CalendarEventBase {
  type: "assignment";
  meta: AssignmentMetadata;
}

export type CalendarEvent = ShiftEvent | HolidayEvent | AssignmentEvent;

/**
 * Metadata for different event types
 */
export type EventMetadata = ShiftMetadata | HolidayMetadata | AssignmentMetadata;

/**
 * Metadata for shift events
 */
export interface ShiftMetadata {
  type: "shift";

  /** Team number (1-5) */
  team: number;

  /** Shift code: M (Morning), L (Late), N (Night), D (Day), O (Off day). */
  shiftCode: "M" | "L" | "N" | "D" | "O";

  /** Start time in HH:mm format (e.g., "07:00", "15:00", "23:00") */
  startTime?: string;

  /** End time in HH:mm format */
  endTime?: string;

  /** CSS class for styling (e.g., "shift-morning", "shift-late") */
  className?: string;
}

/**
 * Metadata for holiday/time-off events
 */
export interface HolidayMetadata {
  type: "holiday";

  /** Event color (WCAG AA compliant from EVENT_COLORS) */
  color: string;

  /** Event flags from .hday format */
  flags: string[];

  /** Event type label (e.g., "Business trip", "Holiday", "Sick leave") */
  typeLabel: string;

  /** Time/location symbol (e.g., "◐" for half_am, "◑" for half_pm) */
  symbol?: string;

  /** The originating TimeOffEntry.id. Lets consumers of CalendarEvent[]
   *  (e.g. getEventsInRange) map an event back to its stored entry without
   *  coupling to CalendarEvent.id, which is an opaque render key. */
  entryId?: string;
}

/**
 * Metadata for assignment/custom events (future expansion)
 */
export interface AssignmentMetadata {
  type: "assignment";

  /** Custom color for the assignment */
  color?: string;

  /** Assignment notes or description */
  notes?: string;
}
