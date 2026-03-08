import type { EventFlag, TimeLocationFlag, TypeFlag } from "../lib/hday/types";

/**
 * Weekday constants for ISO week numbering (Monday=1 through Sunday=7).
 * Used for weekly recurring events and consistent weekday handling throughout the app.
 */
export const Weekday = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
} as const;

/**
 * Type flag options available for time-off events.
 * Each tuple contains the flag value and its human-readable label.
 */
export const TYPE_FLAG_OPTIONS: Array<[TypeFlag | "none", string]> = [
  ["none", "Holiday (default)"],
  ["business", "Business trip"],
  ["course", "Training/Course"],
  ["in", "In office"],
  ["weekend", "Weekend"],
  ["birthday", "Birthday"],
  ["ill", "Sick leave"],
  ["other", "Other"],
];

/**
 * Time/Location flag options available for time-off events.
 * Each tuple contains the flag value and its human-readable label.
 */
export const TIME_LOCATION_FLAG_OPTIONS: Array<[TimeLocationFlag | "none", string]> = [
  ["none", "Full day"],
  ["half_am", "AM (half day)"],
  ["half_pm", "PM (half day)"],
  ["onsite", "Onsite"],
  ["no_fly", "No fly"],
  ["can_fly", "Can fly"],
];

/**
 * Type flags mapped to EventFlag type for use in flag filtering.
 */
export const TYPE_FLAGS_AS_EVENT_FLAGS: readonly EventFlag[] = TYPE_FLAG_OPTIONS.flatMap(([flag]) =>
  flag !== "none" ? [flag as EventFlag] : [],
);

/**
 * Time/Location flags mapped to EventFlag type for use in flag filtering.
 */
export const TIME_LOCATION_FLAGS_AS_EVENT_FLAGS: readonly EventFlag[] =
  TIME_LOCATION_FLAG_OPTIONS.flatMap(([flag]) => (flag !== "none" ? [flag as EventFlag] : []));

/**
 * Valid view modes for the Time Off tab.
 * Defined at module level as a single source of truth for valid view modes.
 * Note: Calendar view has been moved to its own main tab.
 */
export const TIMEOFF_VIEWS = ["table", "stats", "team"] as const;

/**
 * Type derived from TIMEOFF_VIEWS for type-safe view mode handling.
 */
export type TimeOffViewMode = (typeof TIMEOFF_VIEWS)[number];

/**
 * Default weekday value for weekly events (Weekday.Monday).
 */
export const DEFAULT_WEEKDAY = Weekday.Monday;

/**
 * Help text for each view mode in the Time Off tab.
 * Type-checked to ensure all TIMEOFF_VIEWS modes have corresponding help text.
 */
export const VIEW_MODE_HELP_TEXT: Record<(typeof TIMEOFF_VIEWS)[number], string> = {
  table: "Select events from the table to edit or delete.",
  stats: "Review allowance usage and vacation breakdowns by year.",
  team: "View team roster and .hday schedules for all team members.",
};
