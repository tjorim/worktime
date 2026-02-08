import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTimeTrackingStorage } from "../../src/hooks/useTimeTrackingStorage";
import { TIME_TRACKING_STORAGE_KEYS } from "../../src/components/timeTracking/constants";

describe("useTimeTrackingStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("does not block starting a task when only invalid open raw tasks exist", async () => {
    window.localStorage.setItem(
      TIME_TRACKING_STORAGE_KEYS.tasks,
      JSON.stringify([
        {
          id: "invalid-open",
          text: "Broken legacy entry",
          label: "Support",
          startTime: "not-a-date",
          stopTime: null,
        },
      ]),
    );

    const { result } = renderHook(() => useTimeTrackingStorage());
    let added = false;

    await act(async () => {
      added = await result.current.addTask({
        id: "new-running-task",
        text: "Start stopwatch",
        label: "Support",
        startTime: "2026-02-07T08:00",
      });
    });

    expect(added).toBe(true);
  });

  it("blocks starting a task when a valid running task already exists", async () => {
    window.localStorage.setItem(
      TIME_TRACKING_STORAGE_KEYS.tasks,
      JSON.stringify([
        {
          id: "running-task",
          text: "Already running",
          label: "Support",
          startTime: "2026-02-07T07:30",
          stopTime: null,
        },
      ]),
    );

    const { result } = renderHook(() => useTimeTrackingStorage());
    let added = true;

    await act(async () => {
      added = await result.current.addTask({
        id: "new-running-task",
        text: "Should be blocked",
        label: "Support",
        startTime: "2026-02-07T08:00",
      });
    });

    expect(added).toBe(false);
  });
});
