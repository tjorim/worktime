import { describe, expect, it } from "vitest";
import {
  formatLoggedDuration,
  getLoggedMinutes,
  getTotalLoggedMinutes,
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

describe("getTotalLoggedMinutes", () => {
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
  ];

  it("sums logged minutes for entries linked to the given task", () => {
    expect(getTotalLoggedMinutes("task-1", entries)).toBe(150);
  });

  it("returns 0 when no entries are linked to the task", () => {
    expect(getTotalLoggedMinutes("task-3", entries)).toBe(0);
  });
});
