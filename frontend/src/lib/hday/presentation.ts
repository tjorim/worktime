import { getPrimaryTimeLocationFlag, getPrimaryTypeFlag, hasHalfDayFlag } from "./flags";
import * as m from "@/paraglide/messages.js";
import type { EventFlag, HdayEvent, TypeFlag } from "./types";

/**
 * Palette key for an event: which colour set it uses, and whether it is the full-day or half-day
 * look. The colours themselves are CSS custom properties (`--wt-event-<type>-<variant>-bg/-fg`)
 * defined once in `styles/_variables.scss` for both themes; nothing here repeats a hex value.
 *
 * A weekly pattern with no type flag is the standing day off, not booked leave, so it gets its
 * own "recurring" colours instead of the holiday red.
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
 * Background colour for an event as a CSS value (`var(--wt-event-…-bg)`), for the few places that
 * need it inline. Being a variable it follows the light/dark theme with no extra work.
 */
export function getEventColor(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const { type, variant } = getEventPaletteKey(flags, eventType);
  return `var(--wt-event-${type}-${variant}-bg)`;
}

/** Text colour paired with {@link getEventColor}; both are chosen together to meet WCAG AA. */
export function getEventTextColor(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const { type, variant } = getEventPaletteKey(flags, eventType);
  return `var(--wt-event-${type}-${variant}-fg)`;
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
