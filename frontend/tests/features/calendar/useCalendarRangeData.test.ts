import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tasksCollection, timeOffCollection } from "@/db/collections";
import { useCalendarRangeData } from "@/features/calendar/useCalendarRangeData";

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ myTeam: null, scheduleType: "9-5" }),
}));

describe("useCalendarRangeData", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-05-31T12:00:00Z");
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const entry of timeOffCollection.toArray as { id: string }[]) {
      timeOffCollection.delete(entry.id);
    }
    for (const task of tasksCollection.toArray as { id: string }[]) {
      tasksCollection.delete(task.id);
    }
  });

  it("merges range-filtered shifts, time-off entries, and tasks", async () => {
    act(() => {
      timeOffCollection.insert({
        id: "leave-in-range",
        entryKind: "date",
        entryType: "vacation",
        entryFlag: "full_day",
        note: "Memorial Day",
        date: "2026-05-25",
      });
      timeOffCollection.insert({
        id: "leave-outside-range",
        entryKind: "date",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
        date: "2026-05-27",
      });
      tasksCollection.insert({
        id: "task-in-range",
        text: "Review calendar",
        label: "Development",
        startTime: "2026-05-25T09:00",
        stopTime: "2026-05-25T10:00",
      });
      tasksCollection.insert({
        id: "task-outside-range",
        text: "Later task",
        label: "Development",
        startTime: "2026-05-27T09:00",
        stopTime: "2026-05-27T10:00",
      });
    });

    const { result } = renderHook(() =>
      useCalendarRangeData({ start: "2026-05-25", end: "2026-05-26" }),
    );

    await waitFor(() => {
      expect(result.current.map((event) => event.id)).toEqual([
        "shift:1:2026-05-25",
        "shift:1:2026-05-26",
        "time-off:leave-in-range",
        "task:task-in-range",
      ]);
    });
  });
});
