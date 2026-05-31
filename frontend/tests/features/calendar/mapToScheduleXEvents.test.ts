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
  it("maps a timed shift", () => {
    const event = shiftToEvent({ date: dayjs("2026-05-31"), shift: morningShift }, 2);

    expect(event).toMatchObject({
      id: "shift:2:2026-05-31",
      title: "Morning",
      calendarId: "shift",
      shiftCode: "M",
      team: 2,
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
    });
    expect(event.start.toString()).toBe("2026-06-01");
    expect(event.end.toString()).toBe("2026-06-01");
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
      id: "task:task-1",
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

  it("reuses configured time-tracking label colors", () => {
    expect(
      buildCalendarConfig([{ id: "label-1", name: "Development", color: "#abcdef" }]),
    ).toMatchObject({
      shift: { lightColors: { main: "#0d6efd" } },
      "time-off": { lightColors: { main: "#198754" } },
      Development: { lightColors: { main: "#abcdef" } },
    });
  });
});
