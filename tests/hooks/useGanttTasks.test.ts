import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGanttTasks } from "../../src/hooks/useGanttTasks";

describe("useGanttTasks", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("filters invalid tasks from storage", () => {
    window.localStorage.setItem(
      "worktime_gantt_tasks",
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

  it("adds a task with generated id", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "generated-id"),
    });

    const { result } = renderHook(() => useGanttTasks());

    let createdId = "";
    act(() => {
      const created = result.current.addTask({
        name: "Plan sprint",
        start: "2026-03-01",
        end: "2026-03-05",
      });
      createdId = created.id;
    });

    expect(createdId).toBe("generated-id");
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].progress).toBe(0);
  });

  it("keeps provided progress when adding a task", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "generated-id-2"),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({
        name: "Implement chart",
        start: "2026-03-10",
        end: "2026-03-15",
        progress: 65,
      });
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({
      id: "generated-id-2",
      progress: 65,
    });
  });

  it("updates an existing task partially", () => {
    window.localStorage.setItem(
      "worktime_gantt_tasks",
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

  it("removes tasks by id", () => {
    window.localStorage.setItem(
      "worktime_gantt_tasks",
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
  });
});
