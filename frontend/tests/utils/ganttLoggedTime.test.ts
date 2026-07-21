import { describe, expect, it } from "vitest";
import {
  formatLoggedDuration,
  getLoggedMinutes,
  getLoggedMinutesByTaskId,
} from "@/utils/ganttLoggedTime";
import type { StoredTimeTrackingTask } from "@/components/timeTracking/types";

describe("getLoggedMinutes", () => {
  it("computes elapsed minutes between start and stop", () => {
    expect(getLoggedMinutes("2026-06-01T09:00", "2026-06-01T10:30")).toBe(90);
  });

  it("deducts the break duration when includesBreak is set", () => {
    expect(getLoggedMinutes("2026-06-01T09:00", "2026-06-01T10:30", true)).toBe(60);
  });

  it("never returns a negative duration", () => {
    expect(getLoggedMinutes("2026-06-01T10:00", "2026-06-01T09:00")).toBe(0);
    expect(getLoggedMinutes("2026-06-01T09:00", "2026-06-01T09:10", true)).toBe(0);
  });
});

describe("formatLoggedDuration", () => {
  it("formats minutes only", () => {
    expect(formatLoggedDuration(45)).toBe("45 min");
  });

  it("formats whole hours", () => {
    expect(formatLoggedDuration(120)).toBe("2 h");
  });

  it("formats hours and minutes", () => {
    expect(formatLoggedDuration(150)).toBe("2 h 30 min");
  });
});

describe("getLoggedMinutesByTaskId", () => {
  const entries: StoredTimeTrackingTask[] = [
    {
      id: "entry-1",
      text: "Worked",
      label: "Support",
      startTime: "2026-06-01T09:00",
      stopTime: "2026-06-01T10:00",
      ganttTaskId: "task-1",
    },
    {
      id: "entry-2",
      text: "Worked more",
      label: "Support",
      startTime: "2026-06-02T09:00",
      stopTime: "2026-06-02T10:30",
      ganttTaskId: "task-1",
    },
    {
      id: "entry-3",
      text: "Unrelated",
      label: "Support",
      startTime: "2026-06-03T09:00",
      stopTime: "2026-06-03T10:00",
      ganttTaskId: "task-2",
    },
    {
      id: "entry-4",
      text: "Not linked to any task",
      label: "Support",
      startTime: "2026-06-04T09:00",
      stopTime: "2026-06-04T10:00",
    },
  ];

  it("returns a map of total logged minutes grouped by task ID", () => {
    const map = getLoggedMinutesByTaskId(entries);
    expect(map.get("task-1")).toBe(150);
    expect(map.get("task-2")).toBe(60);
    expect(map.get("task-3")).toBeUndefined();
  });

  it("ignores entries without a linked Gantt task", () => {
    const map = getLoggedMinutesByTaskId(entries);
    expect(map.size).toBe(2);
  });
});
