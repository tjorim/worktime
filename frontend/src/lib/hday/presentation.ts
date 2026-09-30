import { getPrimaryTimeLocationFlag, getPrimaryTypeFlag, hasHalfDayFlag } from "./flags";
import * as m from "@/paraglide/messages.js";
import type { EventFlag, HdayEvent, TypeFlag } from "./types";

/**
 * Palette key for an event: which color set it uses, and whether it is the full-day or half-day
 * look. The colors themselves are CSS custom properties (`--wt-event-<type>-<variant>-bg/-fg`)
 * defined once in `styles/_variables.scss` for both themes; nothing here repeats a hex value.
 *
 * A weekly pattern with no type flag is the standing day off, not booked leave, so it gets its
 * own "recurring" colors instead of the holiday red.
 */
type EventPaletteType = Exclude<TypeFlag, "holiday"> | "holiday" | "recurring";

function getEventPaletteKey(
  flags?: ReadonlyArray<EventFlag>,
  eventType?: HdayEvent["type"],
): { type: EventPaletteType; variant: "full" | "half" } {
  const variant = hasHalfDayFlag(flags) ? "half" : "full";
  const primaryType = getPrimaryTypeFlag(flags);
  if (primaryType === "holiday" && eventType === "weekly") {
    return { type: "recurring", variant };
  }
  return { type: primaryType, variant };
}

/**
 * Background color for an event as a CSS value (`var(--wt-event-…-bg)`), for the few places that
 * need it inline. Being a variable it follows the light/dark theme with no extra work.
 */
export function getEventColor(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const { type, variant } = getEventPaletteKey(flags, eventType);
  return `var(--wt-event-${type}-${variant}-bg)`;
}

/** Text color paired with {@link getEventColor}; both are chosen together to meet WCAG AA. */
export function getEventTextColor(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const { type, variant } = getEventPaletteKey(flags, eventType);
  return `var(--wt-event-${type}-${variant}-fg)`;
}

const EVENT_COLOR_UTILITIES = {
  "holiday-full": "tw:bg-wt-event-holiday-full-bg tw:text-wt-event-holiday-full-fg",
  "holiday-half": "tw:bg-wt-event-holiday-half-bg tw:text-wt-event-holiday-half-fg",
  "business-full": "tw:bg-wt-event-business-full-bg tw:text-wt-event-business-full-fg",
  "business-half": "tw:bg-wt-event-business-half-bg tw:text-wt-event-business-half-fg",
  "course-full": "tw:bg-wt-event-course-full-bg tw:text-wt-event-course-full-fg",
  "course-half": "tw:bg-wt-event-course-half-bg tw:text-wt-event-course-half-fg",
  "in-full": "tw:bg-wt-event-in-full-bg tw:text-wt-event-in-full-fg",
  "in-half": "tw:bg-wt-event-in-half-bg tw:text-wt-event-in-half-fg",
  "weekend-full": "tw:bg-wt-event-weekend-full-bg tw:text-wt-event-weekend-full-fg",
  "weekend-half": "tw:bg-wt-event-weekend-half-bg tw:text-wt-event-weekend-half-fg",
  "recurring-full": "tw:bg-wt-event-recurring-full-bg tw:text-wt-event-recurring-full-fg",
  "recurring-half": "tw:bg-wt-event-recurring-half-bg tw:text-wt-event-recurring-half-fg",
  "birthday-full": "tw:bg-wt-event-birthday-full-bg tw:text-wt-event-birthday-full-fg",
  "birthday-half": "tw:bg-wt-event-birthday-half-bg tw:text-wt-event-birthday-half-fg",
  "ill-full": "tw:bg-wt-event-ill-full-bg tw:text-wt-event-ill-full-fg",
  "ill-half": "tw:bg-wt-event-ill-half-bg tw:text-wt-event-ill-half-fg",
  "other-full": "tw:bg-wt-event-other-full-bg tw:text-wt-event-other-full-fg",
  "other-half": "tw:bg-wt-event-other-half-bg tw:text-wt-event-other-half-fg",
} as const;

/** Tailwind event colors are written out so the scanner includes every palette variant. */
export function getEventColorUtilities(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const { type, variant } = getEventPaletteKey(flags, eventType);
  return EVENT_COLOR_UTILITIES[`${type}-${variant}`];
}

export function getEventColorClass(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const { type, variant } = getEventPaletteKey(flags, eventType);
  return `event-${type}-${variant}`;
}

export function getTimeLocationSymbol(flags?: EventFlag[]): string {
  switch (getPrimaryTimeLocationFlag(flags)) {
    case "half_am":
      return "◐";
    case "half_pm":
      return "◑";
    case "onsite":
      return "W";
    case "no_fly":
      return "N";
    case "can_fly":
      return "F";
    default:
      return "";
  }
}

export function getEventClass(flags?: EventFlag[]): string {
  const half = hasHalfDayFlag(flags) ? "half" : "full";
  const primaryType = getPrimaryTypeFlag(flags);

  // "In office" intentionally ignores half-day styling in getEventClass:
  // even when `half` is "half", the `primaryType === "in"` branch always maps to event-in-full.
  if (primaryType === "in") {
    return "event-in-full";
  }

  return `event-${primaryType}-${half}`;
}

/** Translated name of an event's type, e.g. "Business trip" / "Zakenreis". */
export function getEventTypeLabel(flags?: ReadonlyArray<EventFlag>): string {
  switch (getPrimaryTypeFlag(flags)) {
    case "business":
      return m.event_type_business();
    case "weekend":
      return m.event_type_weekend();
    case "birthday":
      return m.event_type_birthday();
    case "ill":
      return m.event_type_ill();
    case "course":
      return m.event_type_course();
    case "in":
      return m.event_type_in();
    case "other":
      return m.event_type_other();
    default:
      return m.event_type_holiday();
  }
}
