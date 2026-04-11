import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import { ganttTasksCollection } from "@/db/collections";

let uniqueCounter = 0;

function nextId(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}`;
}

function clearGanttCollection() {
  const items = [...ganttTasksCollection.toArray];
  for (const item of items) {
    try {
      if (ganttTasksCollection.has(item.id)) {
        ganttTasksCollection.delete(item.id);
      }
    } catch {
      // Ignore rows already removed during teardown.
    }
  }
}

describe("useGanttTasks", () => {
  beforeEach(() => {
    clearGanttCollection();
  });

  afterEach(() => {
    cleanup();
    clearGanttCollection();
    vi.unstubAllGlobals();
  });

  it("returns an empty array when no tasks have been added", () => {
    const { result } = renderHook(() => useGanttTasks());

    expect(result.current.tasks).toEqual([]);
  });

  it("addTask creates a task with generated id", async () => {
    const taskId = nextId("generated-id");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => taskId),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({
        name: "Plan sprint",
        start: "2026-03-01",
        end: "2026-03-05",
      });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0]).toMatchObject({
        id: taskId,
        name: "Plan sprint",
        progress: 0,
      });
    });
  });

  it("updateTask modifies an existing task", async () => {
    const { result } = renderHook(() => useGanttTasks());
    let taskId = "";

    act(() => {
      taskId = result.current.addTask({ name: "Initial", start: "2026-03-01", end: "2026-03-05" }).id;
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
    });

    act(() => {
      result.current.updateTask(taskId, { end: "2026-03-06", progress: 25, notes: "Resized" });
    });

    await waitFor(() => {
      expect(result.current.tasks.find((task) => task.name === "Initial")).toMatchObject({
        name: "Initial",
        end: "2026-03-06",
        progress: 25,
        notes: "Resized",
      });
    });
  });

  it("removeTask deletes the task from state", async () => {
    const { result } = renderHook(() => useGanttTasks());
    let secondId = "";

    act(() => {
      result.current.addTask({ name: "A", start: "2026-03-01", end: "2026-03-05" });
      secondId = result.current.addTask({ name: "B", start: "2026-03-02", end: "2026-03-06" }).id;
    });
    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.name === "A")).toBe(true);
      expect(result.current.tasks.some((task) => task.name === "B")).toBe(true);
    });

    const taskToRemove = result.current.tasks.find((task) => task.name === "B");
    expect(taskToRemove).toBeDefined();

    act(() => {
      result.current.removeTask(taskToRemove!.id);
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.name === "B")).toBe(false);
      expect(result.current.tasks.some((task) => task.name === "A")).toBe(true);
    });
  });

  it("removeTask strips deleted id from other tasks' dependencies", async () => {
    const { result } = renderHook(() => useGanttTasks());
    let firstId = "";
    let secondId = "";

    act(() => {
      const first = result.current.addTask({ name: "A", start: "2026-03-01", end: "2026-03-05" });
      firstId = first.id;
      const second = result.current.addTask({
        name: "B",
        start: "2026-03-02",
        end: "2026-03-06",
        dependencies: first.id,
      });
      secondId = second.id;
      result.current.addTask({
        name: "C",
        start: "2026-03-03",
        end: "2026-03-07",
        dependencies: [first.id, second.id].join(", "),
      });
    });
    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.name === "A")).toBe(true);
      expect(result.current.tasks.some((task) => task.name === "B")).toBe(true);
      expect(result.current.tasks.some((task) => task.name === "C")).toBe(true);
    });

    act(() => {
      result.current.removeTask(firstId);
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.name === "A")).toBe(false);
      expect(result.current.tasks.find((t) => t.name === "B")?.dependencies).toBeUndefined();
      expect(result.current.tasks.find((t) => t.name === "C")?.dependencies).toBe(secondId);
    });
  });

  it("filters invalid tasks (bad date format)", async () => {
    const okId = nextId("ok");
    const badId = nextId("bad-format");
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce(okId)
        .mockReturnValueOnce(badId),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "Valid", start: "2026-02-01", end: "2026-02-03" });
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === okId)).toBe(true);
    });
  });

  it("persists tasks across hook re-renders", async () => {
    const persistentId = nextId("persistent-id");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => persistentId),
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
    await waitFor(() => {
      expect(remountedResult.current.tasks.some((task) => task.id === persistentId)).toBe(true);
    });
  });
});
