import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useGanttTasks } from "../../src/hooks/useGanttTasks";
import { GANTT_STORAGE_KEY } from "../../src/constants/storageKeys";

describe("useGanttTasks", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("returns an empty array when storage is empty", () => {
    const { result } = renderHook(() => useGanttTasks());

    expect(result.current.tasks).toEqual([]);
  });

  it("addTask creates a task with generated id and stores it", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "generated-id"),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({
        name: "Plan sprint",
        start: "2026-03-01",
        end: "2026-03-05",
      });
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({
      id: "generated-id",
      name: "Plan sprint",
      progress: 0,
    });
    expect(JSON.parse(window.localStorage.getItem(GANTT_STORAGE_KEY) ?? "[]")).toEqual([
      {
        id: "generated-id",
        name: "Plan sprint",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: 0,
      },
    ]);
  });

  it("updateTask modifies an existing task", () => {
    window.localStorage.setItem(
      GANTT_STORAGE_KEY,
      JSON.stringify([{ id: "t1", name: "Initial", start: "2026-03-01", end: "2026-03-05" }]),
    );

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.updateTask("t1", { end: "2026-03-06", progress: 25, notes: "Resized" });
    });

    expect(result.current.tasks[0]).toMatchObject({
      id: "t1",
      name: "Initial",
      end: "2026-03-06",
      progress: 25,
      notes: "Resized",
    });
  });

  it("removeTask deletes the task from state and storage", () => {
    window.localStorage.setItem(
      GANTT_STORAGE_KEY,
      JSON.stringify([
        { id: "t1", name: "A", start: "2026-03-01", end: "2026-03-05" },
        { id: "t2", name: "B", start: "2026-03-02", end: "2026-03-06" },
      ]),
    );

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.removeTask("t2");
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe("t1");
    expect(JSON.parse(window.localStorage.getItem(GANTT_STORAGE_KEY) ?? "[]")).toEqual([
      { id: "t1", name: "A", start: "2026-03-01", end: "2026-03-05" },
    ]);
  });

  it("removeTask strips deleted id from other tasks' dependencies", () => {
    window.localStorage.setItem(
      GANTT_STORAGE_KEY,
      JSON.stringify([
        { id: "t1", name: "A", start: "2026-03-01", end: "2026-03-05" },
        { id: "t2", name: "B", start: "2026-03-02", end: "2026-03-06", dependencies: "t1" },
        {
          id: "t3",
          name: "C",
          start: "2026-03-03",
          end: "2026-03-07",
          dependencies: "t1, t2",
        },
      ]),
    );

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.removeTask("t1");
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks.find((t) => t.id === "t2")?.dependencies).toBeUndefined();
    expect(result.current.tasks.find((t) => t.id === "t3")?.dependencies).toBe("t2");
  });

  it("filters invalid tasks from corrupted storage data", () => {
    window.localStorage.setItem(
      GANTT_STORAGE_KEY,
      JSON.stringify([
        { id: "ok", name: "Valid", start: "2026-02-01", end: "2026-02-03" },
        { id: "bad-format", name: "Broken", start: "2026/02/01", end: "2026-02-03" },
        { id: "bad-calendar", name: "Impossible", start: "2026-02-31", end: "2026-03-03" },
      ]),
    );

    const { result } = renderHook(() => useGanttTasks());

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({ id: "ok", progress: 0 });
  });

  it("persists tasks across hook re-renders", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "persistent-id"),
    });

    const { result, unmount } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({
        name: "Persistent task",
        start: "2026-04-01",
        end: "2026-04-02",
      });
    });

    unmount();

    const { result: remountedResult } = renderHook(() => useGanttTasks());
    expect(remountedResult.current.tasks).toEqual([
      {
        id: "persistent-id",
        name: "Persistent task",
        start: "2026-04-01",
        end: "2026-04-02",
        progress: 0,
      },
    ]);
  });
});
