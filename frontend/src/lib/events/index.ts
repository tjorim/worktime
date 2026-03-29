/**
 * Unified event model for Worktime
 *
 * Provides types and converters for working with calendar events
 * from multiple sources (shifts, holidays, assignments).
 */

// Re-export types
export type {
  AssignmentMetadata,
  AssignmentEvent,
  CalendarEvent,
  EventMetadata,
  EventType,
  HolidayMetadata,
  HolidayEvent,
  ShiftMetadata,
  ShiftEvent,
} from "./types";

// Re-export converters
export { filterEventsInRange, hdayToCalendarEvents, shiftToCalendarEvent } from "./converters";
