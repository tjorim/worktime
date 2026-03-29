/**
 * Type definitions for .hday format parsing and events
 */

/**
 * Time and location flags for events
 */
export type TimeLocationFlag = "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly";

/**
 * Type flags that categorize the event
 */
export type TypeFlag =
  | "business"
  | "weekend"
  | "birthday"
  | "ill"
  | "in"
  | "course"
  | "other"
  | "holiday";

/**
 * All possible event flags
 */
export type EventFlag = TimeLocationFlag | TypeFlag;

/**
 * Parsed .hday event representation
 */
export type HdayEvent = {
  /** Event type: range (date range), weekly (recurring), or unknown (unparseable) */
  type: "range" | "weekly" | "unknown";

  /** Start date in YYYY/MM/DD format (for range events) */
  start?: string;

  /** End date in YYYY/MM/DD format (for range events) */
  end?: string;

  /** ISO weekday number 1-7 (for weekly events, Monday=1, Sunday=7) */
  weekday?: number;

  /** Array of flags modifying the event */
  flags?: EventFlag[];

  /** Optional event title/comment */
  title?: string;

  /** Original raw line text (for unknown events) */
  raw?: string;
};

export type HdayRangeEvent = {
  type: "range";
  start: string;
  end: string;
  flags?: EventFlag[];
  title?: string;
  raw?: string;
};

export type HdayWeeklyEvent = {
  type: "weekly";
  weekday: number;
  flags?: EventFlag[];
  title?: string;
  raw?: string;
};
