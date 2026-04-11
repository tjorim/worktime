import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGanttTasks } from "@/hooks/useGanttTasks";

describe("useGanttTasks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty array when no tasks have been added", () => {
    const { result } = renderHook(() => useGanttTasks());

    expect(result.current.tasks).toEqual([]);
  });

  it("addTask creates a task with generated id", () => {
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
  });

  it("updateTask modifies an existing task", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "t1") });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "Initial", start: "2026-03-01", end: "2026-03-05" });
    });

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

  it("removeTask deletes the task from state", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("t1")
        .mockReturnValueOnce("t2"),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "A", start: "2026-03-01", end: "2026-03-05" });
      result.current.addTask({ name: "B", start: "2026-03-02", end: "2026-03-06" });
    });

    act(() => {
      result.current.removeTask("t2");
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe("t1");
  });

  it("removeTask strips deleted id from other tasks' dependencies", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("t1")
        .mockReturnValueOnce("t2")
        .mockReturnValueOnce("t3"),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "A", start: "2026-03-01", end: "2026-03-05" });
      result.current.addTask({ name: "B", start: "2026-03-02", end: "2026-03-06", dependencies: "t1" });
      result.current.addTask({ name: "C", start: "2026-03-03", end: "2026-03-07", dependencies: "t1, t2" });
    });

    act(() => {
      result.current.removeTask("t1");
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks.find((t) => t.id === "t2")?.dependencies).toBeUndefined();
    expect(result.current.tasks.find((t) => t.id === "t3")?.dependencies).toBe("t2");
  });

  it("filters invalid tasks (bad date format)", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("ok")
        .mockReturnValueOnce("bad-format"),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "Valid", start: "2026-02-01", end: "2026-02-03" });
    });

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
