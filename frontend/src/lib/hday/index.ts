/**
 * .hday parsing library
 *
 * Provides parsing, validation, and utilities for working with .hday time-off event files.
 */

// Re-export types
export type { EventFlag, HdayEvent, TimeLocationFlag, TypeFlag } from "./types";

export { parseHday } from "./parser";
export { normalizeEventFlags } from "./flags";
export {
  EVENT_COLORS,
  getEventClass,
  getEventColor,
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
} from "./presentation";
export { buildPreviewLine, toLine } from "./serializer";
export { sortEvents } from "./sort";

// Re-export validation functions
export { isValidDate, parseHdayDate } from "./validation";
