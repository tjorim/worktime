import { getPrimaryTimeLocationFlag, getPrimaryTypeFlag, hasHalfDayFlag } from "./flags";
import * as m from "@/paraglide/messages.js";
import type { EventFlag, HdayEvent, TypeFlag } from "./types";

/**
 * Palette key for an event: which color set it uses, and whether it is the full-day or half-day
 * look. The colors themselves are CSS custom properties (`--wt-event-<type>-<variant>-bg/-fg`)
 * defined once in `styles/event-palette.css` for both themes; nothing here repeats a hex value.
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

const EVENT_PALETTE_VAR = /^var\(--wt-event-([a-z]+-(?:full|half))-(bg|fg)\)$/;

/**
 * Colors for an event whose palette references travel as metadata. Only a declared palette entry's
 * own matching `-bg`/`-fg` pair is accepted; anything else (other CSS, an undeclared entry, or a
 * background and text color from different entries) falls back to the "unknown" pair, so a stray
 * value can never become free-form CSS or lose its contrast pairing. Components hand the result to
 * the `--event-bg` and `--event-fg` custom properties that `bg-event` /
 * `text-event-foreground` read.
 */
export function resolveEventPaletteVars(
  color: string,
  textColor: string,
): { background: string; foreground: string } {
  const bg = EVENT_PALETTE_VAR.exec(color);
  const fg = EVENT_PALETTE_VAR.exec(textColor);
  return bg &&
    fg &&
    bg[2] === "bg" &&
    fg[2] === "fg" &&
    bg[1] === fg[1] &&
    bg[1]! in EVENT_COLOR_UTILITIES
    ? { background: color, foreground: textColor }
    : { background: "var(--wt-event-unknown-bg)", foreground: "var(--wt-event-unknown-fg)" };
}

const EVENT_COLOR_UTILITIES = {
  "holiday-full": "bg-wt-event-holiday-full-bg text-wt-event-holiday-full-fg",
  "holiday-half": "bg-wt-event-holiday-half-bg text-wt-event-holiday-half-fg",
  "business-full": "bg-wt-event-business-full-bg text-wt-event-business-full-fg",
  "business-half": "bg-wt-event-business-half-bg text-wt-event-business-half-fg",
  "course-full": "bg-wt-event-course-full-bg text-wt-event-course-full-fg",
  "course-half": "bg-wt-event-course-half-bg text-wt-event-course-half-fg",
  "in-full": "bg-wt-event-in-full-bg text-wt-event-in-full-fg",
  "in-half": "bg-wt-event-in-half-bg text-wt-event-in-half-fg",
  "weekend-full": "bg-wt-event-weekend-full-bg text-wt-event-weekend-full-fg",
  "weekend-half": "bg-wt-event-weekend-half-bg text-wt-event-weekend-half-fg",
  "recurring-full": "bg-wt-event-recurring-full-bg text-wt-event-recurring-full-fg",
  "recurring-half": "bg-wt-event-recurring-half-bg text-wt-event-recurring-half-fg",
  "birthday-full": "bg-wt-event-birthday-full-bg text-wt-event-birthday-full-fg",
  "birthday-half": "bg-wt-event-birthday-half-bg text-wt-event-birthday-half-fg",
  "ill-full": "bg-wt-event-ill-full-bg text-wt-event-ill-full-fg",
  "ill-half": "bg-wt-event-ill-half-bg text-wt-event-ill-half-fg",
  "other-full": "bg-wt-event-other-full-bg text-wt-event-other-full-fg",
  "other-half": "bg-wt-event-other-half-bg text-wt-event-other-half-fg",
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
