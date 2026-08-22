import { getPrimaryTimeLocationFlag, getPrimaryTypeFlag, hasHalfDayFlag } from "./flags";
import type { EventFlag, HdayEvent } from "./types";

/** Event background colors paired with text colors that meet WCAG AA contrast. */
export const EVENT_COLORS = {
  HOLIDAY_FULL: "#EC0000",
  HOLIDAY_HALF: "#FF8A8A",
  BUSINESS_FULL: "#FF9500",
  BUSINESS_HALF: "#FFC04D",
  COURSE_FULL: "#D9AD00",
  COURSE_HALF: "#F0D04D",
  IN_OFFICE_FULL: "#008899",
  IN_OFFICE_HALF: "#00B8CC",
  WEEKEND_FULL: "#990099",
  WEEKEND_HALF: "#CC66CC",
  BIRTHDAY_FULL: "#0000CC",
  BIRTHDAY_HALF: "#6666FF",
  ILL_FULL: "#336600",
  ILL_HALF: "#669933",
  OTHER_FULL: "#008B8B",
  OTHER_HALF: "#4DB8B8",
  RECURRING_FULL: "#3D6B8C",
  RECURRING_HALF: "#7AA8C4",
} as const;

export const EVENT_TEXT_COLORS = {
  HOLIDAY_FULL: "#FFFFFF",
  HOLIDAY_HALF: "#000000",
  BUSINESS_FULL: "#000000",
  BUSINESS_HALF: "#000000",
  COURSE_FULL: "#000000",
  COURSE_HALF: "#000000",
  IN_OFFICE_FULL: "#000000",
  IN_OFFICE_HALF: "#000000",
  WEEKEND_FULL: "#FFFFFF",
  WEEKEND_HALF: "#000000",
  BIRTHDAY_FULL: "#FFFFFF",
  BIRTHDAY_HALF: "#000000",
  ILL_FULL: "#FFFFFF",
  ILL_HALF: "#000000",
  OTHER_FULL: "#000000",
  OTHER_HALF: "#000000",
  RECURRING_FULL: "#FFFFFF",
  RECURRING_HALF: "#000000",
} as const;

export function getEventColor(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const isHalfDay = hasHalfDayFlag(flags);
  const primaryType = getPrimaryTypeFlag(flags);

  if (primaryType === "holiday" && eventType === "weekly") {
    return isHalfDay ? EVENT_COLORS.RECURRING_HALF : EVENT_COLORS.RECURRING_FULL;
  }

  switch (primaryType) {
    case "business":
      return isHalfDay ? EVENT_COLORS.BUSINESS_HALF : EVENT_COLORS.BUSINESS_FULL;
    case "weekend":
      return isHalfDay ? EVENT_COLORS.WEEKEND_HALF : EVENT_COLORS.WEEKEND_FULL;
    case "birthday":
      return isHalfDay ? EVENT_COLORS.BIRTHDAY_HALF : EVENT_COLORS.BIRTHDAY_FULL;
    case "ill":
      return isHalfDay ? EVENT_COLORS.ILL_HALF : EVENT_COLORS.ILL_FULL;
    case "course":
      return isHalfDay ? EVENT_COLORS.COURSE_HALF : EVENT_COLORS.COURSE_FULL;
    case "in":
      return isHalfDay ? EVENT_COLORS.IN_OFFICE_HALF : EVENT_COLORS.IN_OFFICE_FULL;
    case "other":
      return isHalfDay ? EVENT_COLORS.OTHER_HALF : EVENT_COLORS.OTHER_FULL;
    default:
      return isHalfDay ? EVENT_COLORS.HOLIDAY_HALF : EVENT_COLORS.HOLIDAY_FULL;
  }
}

export function getEventTextColor(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const isHalfDay = hasHalfDayFlag(flags);
  const primaryType = getPrimaryTypeFlag(flags);

  if (primaryType === "holiday" && eventType === "weekly") {
    return isHalfDay ? EVENT_TEXT_COLORS.RECURRING_HALF : EVENT_TEXT_COLORS.RECURRING_FULL;
  }

  switch (primaryType) {
    case "business":
      return isHalfDay ? EVENT_TEXT_COLORS.BUSINESS_HALF : EVENT_TEXT_COLORS.BUSINESS_FULL;
    case "weekend":
      return isHalfDay ? EVENT_TEXT_COLORS.WEEKEND_HALF : EVENT_TEXT_COLORS.WEEKEND_FULL;
    case "birthday":
      return isHalfDay ? EVENT_TEXT_COLORS.BIRTHDAY_HALF : EVENT_TEXT_COLORS.BIRTHDAY_FULL;
    case "ill":
      return isHalfDay ? EVENT_TEXT_COLORS.ILL_HALF : EVENT_TEXT_COLORS.ILL_FULL;
    case "course":
      return isHalfDay ? EVENT_TEXT_COLORS.COURSE_HALF : EVENT_TEXT_COLORS.COURSE_FULL;
    case "in":
      return isHalfDay ? EVENT_TEXT_COLORS.IN_OFFICE_HALF : EVENT_TEXT_COLORS.IN_OFFICE_FULL;
    case "other":
      return isHalfDay ? EVENT_TEXT_COLORS.OTHER_HALF : EVENT_TEXT_COLORS.OTHER_FULL;
    default:
      return isHalfDay ? EVENT_TEXT_COLORS.HOLIDAY_HALF : EVENT_TEXT_COLORS.HOLIDAY_FULL;
  }
}

export function getEventColorClass(flags?: EventFlag[], eventType?: HdayEvent["type"]): string {
  const suffix = hasHalfDayFlag(flags) ? "half" : "full";
  const primaryType = getPrimaryTypeFlag(flags);

  if (primaryType !== "holiday") {
    return `event-${primaryType}-${suffix}`;
  }

  if (eventType === "weekly") {
    return `event-recurring-${suffix}`;
  }

  return `event-holiday-${suffix}`;
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

export function getEventTypeLabel(flags?: ReadonlyArray<EventFlag>): string {
  switch (getPrimaryTypeFlag(flags)) {
    case "business":
      return "Business trip";
    case "weekend":
      return "Weekend";
    case "birthday":
      return "Birthday";
    case "ill":
      return "Sick leave";
    case "course":
      return "Training";
    case "in":
      return "In office";
    case "other":
      return "Other";
    default:
      return "Holiday";
  }
}
