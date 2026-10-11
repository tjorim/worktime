import { describe, expect, it } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import { buildRecentWeeks } from "@/features/timeTracking/hooks/useRecentWeeks";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

const task = (
  start: string,
  stop: string | undefined,
  includesBreak?: boolean,
): StoredTimeTrackingTask => ({
  id: `${start}-${stop}`,
  text: "work",
  label: "Development",
  startTime: start,
  stopTime: stop,
  includesBreak: includesBreak ? true : undefined,
});

describe("buildRecentWeeks", () => {
  // 2025-01-08 is a Wednesday in ISO week 2.
  const now = dayjs("2025-01-08T12:00:00");

  it("returns the requested number of weeks, oldest first, ending with the viewed week", () => {
    const weeks = buildRecentWeeks([], "2025-01-08", now, 4);

    expect(weeks.map((week) => week.start)).toEqual([
      "2024-12-16",
      "2024-12-23",
      "2024-12-30",
      "2025-01-06",
    ]);
    // ISO week numbers continue across the year boundary.
    expect(weeks.map((week) => week.isoWeek)).toEqual([51, 52, 1, 2]);
  });

  it("covers Monday to Sunday for every week", () => {
    const [week] = buildRecentWeeks([], "2025-01-08", now, 1);

    expect(week?.days.map((day) => day.iso)).toEqual([
      "2025-01-06",
      "2025-01-07",
      "2025-01-08",
      "2025-01-09",
      "2025-01-10",
      "2025-01-11",
      "2025-01-12",
    ]);
    expect(week?.days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("sums hours per day and per week", () => {
    const weeks = buildRecentWeeks(
      [
        task("2025-01-06T09:00:00", "2025-01-06T12:00:00"),
        task("2025-01-06T13:00:00", "2025-01-06T15:00:00"),
        task("2025-01-07T09:00:00", "2025-01-07T11:30:00"),
        task("2024-12-31T09:00:00", "2024-12-31T17:00:00"),
      ],
      "2025-01-08",
      now,
      2,
    );

    expect(weeks[1]?.days[0]?.hours).toBe(5);
    expect(weeks[1]?.days[1]?.hours).toBe(2.5);
    expect(weeks[1]?.hours).toBe(7.5);
    expect(weeks[0]?.hours).toBe(8);
  });

  it("deducts the break from tasks that include one", () => {
    const [week] = buildRecentWeeks(
      [task("2025-01-06T08:00:00", "2025-01-06T17:00:00", true)],
      "2025-01-06",
      now,
      1,
    );

    expect(week?.days[0]?.hours).toBe(8.5);
  });

  it("counts a running task up to the current time", () => {
    const [week] = buildRecentWeeks([task("2025-01-08T09:00:00", undefined)], "2025-01-08", now, 1);

    expect(week?.days[2]?.hours).toBe(3);
  });

  it("ignores tasks outside the window", () => {
    const weeks = buildRecentWeeks(
      [
        task("2024-12-01T09:00:00", "2024-12-01T17:00:00"),
        task("2025-01-13T09:00:00", "2025-01-13T17:00:00"),
      ],
      "2025-01-08",
      now,
      2,
    );

    expect(weeks.every((week) => week.hours === 0)).toBe(true);
  });
});
