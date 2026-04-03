import type { HdayEvent } from "./types";

/**
 * Sort events by date and type.
 *
 * Range events come first by start date, then weekly events by ISO weekday,
 * then unknown lines in their original relative order.
 */
export function sortEvents(events: HdayEvent[]): HdayEvent[] {
  return [...events].sort((left, right) => {
    if (left.type === "range" && right.type === "range") {
      const leftStart = left.start ?? "";
      const rightStart = right.start ?? "";

      if (!leftStart && !rightStart) {
        return 0;
      }
      if (!leftStart) {
        return 1;
      }
      if (!rightStart) {
        return -1;
      }

      return leftStart.localeCompare(rightStart);
    }

    if (left.type === "range") {
      return -1;
    }
    if (right.type === "range") {
      return 1;
    }

    if (left.type === "weekly" && right.type === "weekly") {
      return (left.weekday ?? 0) - (right.weekday ?? 0);
    }

    if (left.type === "weekly") {
      return -1;
    }
    if (right.type === "weekly") {
      return 1;
    }

    return 0;
  });
}
