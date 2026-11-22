import { contrastRatio, loadEventPalette } from "@tests/utils/eventPalette";
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  buildCalendarConfig,
  shiftToEvent,
  taskToEvent,
  timeOffToEvent,
} from "@/features/calendar/unified/mapToScheduleXEvents";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import type { Shift } from "@/lib/schedule/shiftCalculations";

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
      title: "Holiday – Beach day",
      calendarId: "event-holiday-full",
      entryTypeLabel: "Holiday",
      entryId: "leave-1",
      _options: { disableDND: true, disableResize: true },
    });
    expect(event.start.toString()).toBe("2026-06-01");
    expect(event.end.toString()).toBe("2026-06-01");
  });

  it("keeps the inclusive last date of a time-off range", () => {
    const event = timeOffToEvent({
      id: "leave-2",
      entryKind: "range",
      entryType: "ill",
      entryFlag: "full_day",
      note: null,
      start: "2026-11-23",
      end: "2026-11-27",
    });

    expect(event.start.toString()).toBe("2026-11-23");
    expect(event.end.toString()).toBe("2026-11-27");
    expect(event).toMatchObject({
      title: "Sick leave",
      entryTypeLabel: "Sick leave",
      calendarId: "event-ill-full",
    });
  });

  it("gives weekly days off the recurring palette and shows the half-day flag", () => {
    const event = timeOffToEvent(
      {
        id: "weekly-1:2026-11-18",
        entryKind: "date",
        entryType: "vacation",
        entryFlag: "half_am",
        note: null,
        date: "2026-11-18",
      },
      "weekly",
    );

    expect(event).toMatchObject({ title: "◐ Holiday", calendarId: "event-recurring-half" });
    expect(event.end.toString()).toBe("2026-11-18");
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
    for (const [id, calendar] of Object.entries(config)) {
      if (id.startsWith("event-")) continue;
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

  it("registers the shared event palette CSS variables for both Schedule-X themes", () => {
    const config = buildCalendarConfig([]);
    const palette = loadEventPalette();
    for (const [theme, entries] of Object.entries(palette)) {
      for (const key of Object.keys(entries).filter((key) => key !== "unknown")) {
        const calendar = config[`event-${key}`];
        const colors = {
          main: `var(--wt-event-${key}-bg)`,
          container: `var(--wt-event-${key}-bg)`,
          onContainer: `var(--wt-event-${key}-fg)`,
        };
        expect(calendar?.colorName).toBe(`event-${key}`);
        expect(theme === "light" ? calendar?.lightColors : calendar?.darkColors).toEqual(colors);
      }
    }
  });

  it("reuses configured time-tracking label colors", () => {
    expect(
      buildCalendarConfig([{ id: "label-1", name: "Development", color: "#abcdef" }]),
    ).toMatchObject({
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
