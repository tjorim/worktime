import { contrastRatio } from "@tests/utils/eventPalette";
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  buildCalendarConfig,
  shiftToEvent,
  taskToEvent,
  timeOffToEvent,
} from "@/features/calendar/mapToScheduleXEvents";
import { dayjs } from "@/utils/dateTimeUtils";
import type { Shift } from "@/utils/shiftCalculations";

vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC");

const morningShift: Shift = {
  code: "M",
  displayCode: "M",
  emoji: "🌅",
  name: "Morning",
  start: 7,
  end: 15,
  isWorking: true,
  className: "shift-morning",
};

describe("mapToScheduleXEvents", () => {
  it.each([
    ["2026-10-24", "+02:00"],
    ["2026-10-26", "+01:00"],
  ])("preserves local shift and task times on %s across Brussels DST", (date, offset) => {
    vi.mocked(Temporal.Now.timeZoneId)
      .mockReturnValueOnce("Europe/Brussels")
      .mockReturnValueOnce("Europe/Brussels")
      .mockReturnValueOnce("Europe/Brussels")
      .mockReturnValueOnce("Europe/Brussels");
    const shift = shiftToEvent({ date: dayjs(date), shift: morningShift }, 1);
    expect(shift.start.toString()).toBe(`${date}T07:00:00${offset}[Europe/Brussels]`);
    expect(shift.end.toString()).toBe(`${date}T15:00:00${offset}[Europe/Brussels]`);
    const task = taskToEvent({
      id: "dst",
      text: "Task",
      label: "work",
      startTime: `${date}T08:30`,
      stopTime: `${date}T09:30`,
    });
    expect(task.start.toString()).toBe(`${date}T08:30:00${offset}[Europe/Brussels]`);
  });
  it("keeps an overnight shift's wall-clock end across the autumn clock change", () => {
    vi.mocked(Temporal.Now.timeZoneId)
      .mockReturnValueOnce("Europe/Brussels")
      .mockReturnValueOnce("Europe/Brussels");
    const event = shiftToEvent(
      {
        date: dayjs("2026-10-24"),
        shift: {
          ...morningShift,
          code: "N",
          name: "Night",
          start: 23,
          end: 7,
        },
      },
      1,
    );
    expect(event.start.toString()).toBe("2026-10-24T23:00:00+02:00[Europe/Brussels]");
    expect(event.end.toString()).toBe("2026-10-25T07:00:00+01:00[Europe/Brussels]");
  });

  it("maps a timed shift", () => {
    const event = shiftToEvent({ date: dayjs("2026-05-31"), shift: morningShift }, 2);

    expect(event).toMatchObject({
      id: "shift:2:2026-05-31",
      title: "Morning",
      calendarId: "shift-M",
      shiftCode: "M",
      team: 2,
      _options: { disableDND: true, disableResize: true },
    });
    expect(event.start.toString()).toBe("2026-05-31T07:00:00+00:00[UTC]");
    expect(event.end.toString()).toBe("2026-05-31T15:00:00+00:00[UTC]");
  });

  it("maps all-day time-off", () => {
    const event = timeOffToEvent({
      id: "leave-1",
      entryKind: "date",
      entryType: "vacation",
      entryFlag: "full_day",
      note: "Beach day",
      date: "2026-06-01",
    });

    expect(event).toMatchObject({
      id: "time-off:leave-1",
      title: "Beach day",
      calendarId: "time-off",
      entryId: "leave-1",
      _options: { disableDND: true, disableResize: true },
    });
    expect(event.start.toString()).toBe("2026-06-01");
    expect(event.end.toString()).toBe("2026-06-02");
  });

  it("maps a completed task", () => {
    const event = taskToEvent({
      id: "task-1",
      text: "Write tests",
      label: "Development",
      startTime: "2026-05-31T09:00",
      stopTime: "2026-05-31T10:30",
    });

    expect(event).toMatchObject({
      id: "task-task-1",
      title: "Write tests",
      calendarId: "Development",
      taskId: "task-1",
      isRunning: false,
    });
    expect(event.end.toString()).toBe("2026-05-31T10:30:00+00:00[UTC]");
  });

  it("uses the current time as the provisional end for a running task", () => {
    const now = Temporal.ZonedDateTime.from("2026-05-31T11:00:00+00:00[UTC]");
    const event = taskToEvent(
      {
        id: "task-2",
        text: "Investigate issue",
        label: "Support",
        startTime: "2026-05-31T10:45",
      },
      now,
    );

    expect(event.end).toBe(now);
    expect(event.isRunning).toBe(true);
  });

  it("keeps every Schedule-X event palette at WCAG AA text contrast in both themes", () => {
    const config = buildCalendarConfig([
      { id: "orange", name: "Orange", color: "#f97316" },
      { id: "pale", name: "Pale", color: "#abcdef" },
      { id: "dark", name: "Dark", color: "#123456" },
    ]);
    for (const calendar of Object.values(config)) {
      for (const colors of [calendar.lightColors!, calendar.darkColors!]) {
        expect(
          contrastRatio(
            colors.container,
            colors.onContainer.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3"),
          ),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("reuses configured time-tracking label colors", () => {
    expect(
      buildCalendarConfig([{ id: "label-1", name: "Development", color: "#abcdef" }]),
    ).toMatchObject({
      "time-off": { lightColors: { main: "#198754" } },
      "label-1": { lightColors: { main: "#abcdef" } },
    });
  });

  it("gives each shift code its own color, matching the shift badge palette", () => {
    const config = buildCalendarConfig([]);

    expect(config).toMatchObject({
      "shift-M": { lightColors: { main: "#1976d2" }, darkColors: { main: "#1565c0" } },
      "shift-L": { lightColors: { main: "#bf360c" }, darkColors: { main: "#8d3200" } },
      "shift-N": { lightColors: { main: "#7b1fa2" }, darkColors: { main: "#4527a0" } },
      "shift-D": { lightColors: { main: "#f57c00" }, darkColors: { main: "#b85500" } },
      "shift-O": { lightColors: { main: "#616161" }, darkColors: { main: "#616161" } },
    });
  });
});
