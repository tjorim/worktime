import { afterEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import { createDragAndDropPlugin, localDateTime } from "@/features/calendar/dragAndDropAdapter";
import { taskToEvent } from "@/features/calendar/mapToScheduleXEvents";

afterEach(() => vi.restoreAllMocks());

describe("calendar drag adapter", () => {
  it.each(["2026-10-24", "2026-10-26"])("round-trips a dragged task in Brussels on %s", (date) => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("Europe/Brussels");
    const event = taskToEvent({
      id: "task",
      text: "Work",
      label: "work",
      startTime: "2026-10-24T08:30",
      stopTime: "2026-10-24T09:30",
    });
    // The plugin changes the calendar date, retaining the event's wall-clock fields.
    const moved = (event.start as Temporal.ZonedDateTime).with({ day: Number(date.slice(-2)) });
    expect(localDateTime(moved)).toBe(`${date}T08:30`);
    expect(localDateTime(moved.withTimeZone("UTC"))).toBe(`${date}T08:30`);
  });

  it("exposes the v4 drag entry points", () => {
    const plugin = createDragAndDropPlugin();
    expect(plugin.startTimeGridDrag).toBeTypeOf("function");
    expect(plugin.startDateGridDrag).toBeTypeOf("function");
    expect(plugin.startMonthGridDrag).toBeTypeOf("function");
  });
});
