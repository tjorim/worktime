import { describe, expect, it } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import type { HdayEvent } from "@/lib/hday/types";
import { getHalfDay, getScrollLeftForColumn, indexEventsByDate } from "@/utils/teamCalendarGrid";

const base = {
  containerLeft: 100,
  containerWidth: 1000,
  currentScrollLeft: 0,
  columnWidth: 28,
  stickyWidth: 200,
};

describe("getScrollLeftForColumn", () => {
  it("centers the column in the space right of the sticky column", () => {
    // Column sits 1500px into the content (viewport x = 100 + 1500).
    const scrollLeft = getScrollLeftForColumn({ ...base, columnLeft: 1600 });
    // Column x in viewport after scrolling = 100 + 1500 - scrollLeft; the visible
    // area is [300, 1100], so its center is 700 => column left 686.
    expect(100 + 1500 - scrollLeft).toBeCloseTo(300 + (800 - 28) / 2);
  });

  it("accounts for the current scroll position", () => {
    // Same column, but the container is already scrolled by 400px.
    const fresh = getScrollLeftForColumn({ ...base, columnLeft: 1600 });
    const scrolled = getScrollLeftForColumn({
      ...base,
      currentScrollLeft: 400,
      columnLeft: 1600 - 400,
    });
    expect(scrolled).toBeCloseTo(fresh);
  });

  it("never scrolls to a negative offset for a column near the start", () => {
    expect(getScrollLeftForColumn({ ...base, columnLeft: 350 })).toBe(0);
  });
});

const days = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => dayjs(from).add(i, "day"));

describe("indexEventsByDate", () => {
  it("indexes range events on every day they cover, inclusive", () => {
    const trip: HdayEvent = { type: "range", start: "2026/03/02", end: "2026/03/04" };
    const index = indexEventsByDate([trip], days("2026-03-01", 6));

    expect([...index.keys()]).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
    expect(index.get("2026-03-03")).toEqual([trip]);
  });

  it("matches weekly events on the ISO weekday", () => {
    const monday: HdayEvent = { type: "weekly", weekday: 1 };
    // 2026-03-02 is a Monday.
    const index = indexEventsByDate([monday], days("2026-03-01", 9));

    expect([...index.keys()]).toEqual(["2026-03-02", "2026-03-09"]);
  });

  it("returns the original event objects in the member's event order", () => {
    const weekly: HdayEvent = { type: "weekly", weekday: 1 };
    const range: HdayEvent = { type: "range", start: "2026/03/02", end: "2026/03/02" };
    const index = indexEventsByDate([weekly, range], days("2026-03-02", 1));

    const found = index.get("2026-03-02")!;
    expect(found[0]).toBe(weekly);
    expect(found[1]).toBe(range);
  });

  it("ignores unknown events and ranges missing a bound", () => {
    const events: HdayEvent[] = [
      { type: "unknown", raw: "???" },
      { type: "range", start: "2026/03/02" },
    ];
    expect(indexEventsByDate(events, days("2026-03-01", 5)).size).toBe(0);
  });
});

describe("getHalfDay", () => {
  it("reads the half from the flags", () => {
    expect(getHalfDay({ type: "range", flags: ["half_am"] })).toBe("am");
    expect(getHalfDay({ type: "range", flags: ["half_pm"] })).toBe("pm");
    expect(getHalfDay({ type: "range", flags: ["business"] })).toBeNull();
    expect(getHalfDay({ type: "range" })).toBeNull();
  });
});
