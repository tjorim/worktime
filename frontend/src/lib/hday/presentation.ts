import { getPrimaryTimeLocationFlag, getPrimaryTypeFlag, hasHalfDayFlag } from "./flags";
import type { EventFlag, HdayEvent } from "./types";

/** Event background colors chosen to keep black text readable. */
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
} as const;

export function getEventColor(flags?: EventFlag[]): string {
  const isHalfDay = hasHalfDayFlag(flags);
  switch (getPrimaryTypeFlag(flags)) {
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

/** @deprecated Use getTimeLocationSymbol. */
export const getHalfDaySymbol = getTimeLocationSymbol;

export function getEventClass(flags?: EventFlag[]): string {
  const half = hasHalfDayFlag(flags) ? "half" : "full";
  const primaryType = getPrimaryTypeFlag(flags);

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
