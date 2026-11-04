import { describe, it, expect } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  taskStopTime,
  overlapsTaskInterval,
  actualTaskDurationHours,
  isValidTaskInterval,
} from "@/lib/timeTracking/timeUtils";
import { buildRecentWeeks } from "@/features/timeTracking/hooks/useRecentWeeks";

describe("overnight task intervals", () => {
  it("enforces elapsed duration on a DST fall-back night", () => {
    expect(isValidTaskInterval("2026-10-24T01:00:00+02:00", "2026-10-25T01:00:00+02:00")).toBe(
      true,
    );
    expect(isValidTaskInterval("2026-10-24T03:00:00+02:00", "2026-10-25T02:30:00+01:00")).toBe(
      false,
    );
  });
  it("resolves month and year boundaries", () => {
    expect(taskStopTime("2026-12-31", "23:00", "06:30")).toBe("2027-01-01T06:30");
    expect(taskStopTime("2026-12-31", "09:00", "17:00")).toBe("2026-12-31T17:00");
  });
  it("checks both days and allows adjacency", () => {
    const tasks = [
      {
        id: "a",
        text: "Night",
        label: "work",
        startTime: "2026-01-04T23:00",
        stopTime: "2026-01-05T06:30",
      },
    ];
    expect(overlapsTaskInterval("2026-01-05T06:00", "2026-01-05T07:00", tasks)).toBe(true);
    expect(overlapsTaskInterval("2026-01-04T22:00", "2026-01-04T23:30", tasks)).toBe(true);
    expect(overlapsTaskInterval("2026-01-05T06:30", "2026-01-05T07:00", tasks)).toBe(false);
    expect(overlapsTaskInterval("2026-01-05T06:00", "2026-01-05T07:00", tasks, "a")).toBe(false);
  });
  it.each([
    ["2026-03-28T23:00:00+01:00", "2026-03-29T07:00:00+02:00", 7],
    ["2026-10-24T23:00:00+02:00", "2026-10-25T07:00:00+01:00", 9],
  ])("counts elapsed hours through DST (%s)", (startTime, stopTime, expected) => {
    const task = {
      id: "a",
      text: "Night",
      label: "work",
      startTime,
      stopTime,
      includesBreak: true,
    };
    expect(actualTaskDurationHours(task, dayjs("2027-01-01"))).toBe(expected - 0.5);
  });
  it("attributes a Sunday night entirely to its start week", () => {
    const task = {
      id: "a",
      text: "Night",
      label: "work",
      startTime: "2026-01-04T23:00",
      stopTime: "2026-01-05T07:00",
    };
    const weeks = buildRecentWeeks([task], "2026-01-05", dayjs("2026-01-06"), 2);
    expect(weeks.map((week) => week.hours)).toEqual([8, 0]);
    expect(weeks[0]?.days[6]?.hours).toBe(8);
  });
});
