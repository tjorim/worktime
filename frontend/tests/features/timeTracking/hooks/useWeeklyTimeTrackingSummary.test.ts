import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import { useWeeklyTimeTrackingSummary } from "@/features/timeTracking/hooks/useWeeklyTimeTrackingSummary";
import { buildRecentWeeks } from "@/features/timeTracking/hooks/useRecentWeeks";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

describe("actual hours across weekly reports", () => {
  it.each([
    ["future", "14:00", "18:00", false, 0],
    ["future with break", "14:00", "18:00", true, 0],
    ["scheduled underway", "09:00", "18:00", false, 3],
    ["scheduled underway with break", "09:00", "18:00", true, 2.5],
    ["completed", "08:00", "10:00", false, 2],
    ["completed with break", "08:00", "10:00", true, 1.5],
    ["running", "09:00", undefined, false, 3],
    ["running with break", "09:00", undefined, true, 2.5],
    ["just starting", "12:00", "18:00", true, 0],
    ["short elapsed break", "11:45", "18:00", true, 0],
  ] as const)("counts %s consistently", (_, start, stop, includesBreak, expected) => {
    const now = dayjs("2025-01-08T12:00:00");
    const tasks: StoredTimeTrackingTask[] = [
      {
        id: "task",
        text: "work",
        label: "work",
        startTime: `2025-01-08T${start}:00`,
        stopTime: stop ? `2025-01-08T${stop}:00` : undefined,
        includesBreak,
      },
    ];
    const { result } = renderHook(() =>
      useWeeklyTimeTrackingSummary({
        tasks,
        labels: [{ id: "work", name: "Work", color: "blue" }],
        liveTime: now,
        start: "2025-01-06",
        end: "2025-01-12",
        defaultLabelColor: "blue",
      }),
    );
    expect(result.current.weekTotal).toBe(expected);
    expect(result.current.rows[0]?.hours).toBe(expected);
    expect(result.current.summary.Work).toBe(expected);
    expect(result.current.dailyTotals["2025-01-08"]?.Work).toBe(expected);
    expect(result.current.dailyHourTotals).toEqual([0, 0, expected, 0, 0, 0, 0]);
    expect(result.current.avgDailyHours).toBe(expected);
    expect(result.current.labelPercentages).toEqual(
      expected ? [{ label: "Work", hours: expected, percentage: 100, color: "blue" }] : [],
    );
    const [week] = buildRecentWeeks(tasks, "2025-01-08", now, 1);
    expect(week?.hours).toBe(expected);
    expect(week?.days[2]?.hours).toBe(expected);
  });
});

it("attributes a Sunday night and its one break to the start week", () => {
  const task = {
    id: "night",
    text: "Night",
    label: "work",
    startTime: "2026-01-04T23:00",
    stopTime: "2026-01-05T07:00",
    includesBreak: true,
  };
  const base = {
    tasks: [task],
    labels: [{ id: "work", name: "Work", color: "blue" }],
    liveTime: dayjs("2026-01-06"),
    defaultLabelColor: "blue",
  };
  const { result } = renderHook(() =>
    useWeeklyTimeTrackingSummary({ ...base, start: "2025-12-29", end: "2026-01-04" }),
  );
  expect(result.current.weekTotal).toBe(7.5);
  expect(result.current.dailyTotals["2026-01-04"]?.Work).toBe(7.5);
  const next = renderHook(() =>
    useWeeklyTimeTrackingSummary({ ...base, start: "2026-01-05", end: "2026-01-11" }),
  );
  expect(next.result.current.weekTotal).toBe(0);
});
