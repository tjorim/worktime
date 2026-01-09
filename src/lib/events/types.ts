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
export interface CalendarEvent {
  /** Unique identifier (UUID v4) for React keys and references */
  id: string;

  /** Event type discriminator */
  type: EventType;

  /** Start date in ISO format (YYYY-MM-DD) */
  start: string;

  /** End date in ISO format (YYYY-MM-DD) - inclusive */
  end: string;

  /** Display label for the event */
  label?: string;

  /** Type-specific metadata for rendering and logic */
  meta?: EventMetadata;
}

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

  /** Shift code: M, L, N, or X (off day) */
  shiftCode: "M" | "L" | "N" | "X";

  /** Start time in HH:mm format (e.g., "07:00", "15:00", "23:00") */
  startTime?: string;

  /** End time in HH:mm format */
  endTime?: string;

  /** CSS class for styling (e.g., "shift-morning", "shift-evening") */
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

  /** Original HdayEvent index for CRUD operations */
  sourceIndex?: number;
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
