import type { Dayjs } from "dayjs";
import type { HdayEvent } from "@/lib/hday/types";

/**
 * Horizontal scroll offset that brings a grid column into view.
 *
 * The name column is sticky, so the column has to clear it as well: the target
 * is centred in the space to the right of the sticky column, and never
 * negative (a column near the start just leaves the grid scrolled to 0).
 */
export function getScrollLeftForColumn({
  containerLeft,
  containerWidth,
  currentScrollLeft,
  columnLeft,
  columnWidth,
  stickyWidth,
}: {
  containerLeft: number;
  containerWidth: number;
  currentScrollLeft: number;
  columnLeft: number;
  columnWidth: number;
  stickyWidth: number;
}): number {
  const columnOffset = columnLeft - containerLeft + currentScrollLeft;
  const visibleWidth = containerWidth - stickyWidth;
  return Math.max(0, columnOffset - stickyWidth - (visibleWidth - columnWidth) / 2);
}

const isoKey = (date: Dayjs) => date.format("YYYY-MM-DD");

/**
 * Events per day for one member, keyed by ISO date. Built once per member and
 * range instead of re-filtering (and re-parsing dates) for every cell, which
 * also makes the neighbouring-day lookups used to group ranges cheap.
 *
 * Range events use `YYYY/MM/DD`, which converts to ISO keys that compare
 * correctly as strings. Weekly events match on ISO weekday (1 = Monday).
 * Result arrays keep the member's event order and hold the original event
 * objects, so identity comparison tells whether two days share an event.
 */
export function indexEventsByDate(events: HdayEvent[], dates: Dayjs[]): Map<string, HdayEvent[]> {
  const ranges = events.flatMap((event) =>
    event.type === "range" && event.start && event.end
      ? [{ event, start: event.start.replace(/\//g, "-"), end: event.end.replace(/\//g, "-") }]
      : [],
  );
  const weekly = events.filter((event) => event.type === "weekly" && event.weekday);
  const order = new Map(events.map((event, index) => [event, index]));

  const byDate = new Map<string, HdayEvent[]>();
  for (const date of dates) {
    const key = isoKey(date);
    const weekday = date.isoWeekday();
    const matches = [
      ...ranges.filter((range) => range.start <= key && key <= range.end).map((r) => r.event),
      ...weekly.filter((event) => event.weekday === weekday),
    ];
    if (matches.length > 0) {
      matches.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      byDate.set(key, matches);
    }
  }
  return byDate;
}

export type HalfDay = "am" | "pm";

/** Which half of the day an event covers, or null for a full day. */
export function getHalfDay(event: HdayEvent): HalfDay | null {
  if (event.flags?.includes("half_am")) return "am";
  if (event.flags?.includes("half_pm")) return "pm";
  return null;
}
