import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import { ganttTasksCollection, replaceCollectionContents } from "@/db/collections";

let uniqueCounter = 0;

function nextId(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}`;
}

describe("useGanttTasks", () => {
  afterEach(() => {
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
    const taskId = nextId("update-task");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => taskId),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "Initial", start: "2026-03-01", end: "2026-03-05" });
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
    });

    act(() => {
      result.current.updateTask(taskId, { end: "2026-03-06", progress: 25, notes: "Resized" });
    });

    await waitFor(() => {
      expect(result.current.tasks.find((task) => task.id === taskId)).toMatchObject({
        id: taskId,
        name: "Initial",
        end: "2026-03-06",
        progress: 25,
        notes: "Resized",
      });
    });
  });

  it("removeTask deletes the task from state", async () => {
    const firstId = nextId("remove-a");
    const secondId = nextId("remove-b");

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      replaceCollectionContents(
        ganttTasksCollection,
        [
          { id: firstId, name: "A", start: "2026-03-01", end: "2026-03-05", progress: 0 },
          { id: secondId, name: "B", start: "2026-03-02", end: "2026-03-06", progress: 0 },
        ],
        (task) => task.id,
      );
    });
    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === firstId)).toBe(true);
      expect(result.current.tasks.some((task) => task.id === secondId)).toBe(true);
    });

    act(() => {
      result.current.removeTask(secondId);
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === secondId)).toBe(false);
      expect(result.current.tasks.some((task) => task.id === firstId)).toBe(true);
    });
  });

  it("removeTask strips deleted id from other tasks' dependencies", async () => {
    const firstGeneratedId = nextId("dep-a");
    const secondGeneratedId = nextId("dep-b");
    const thirdGeneratedId = nextId("dep-c");

    const { result } = renderHook(() => useGanttTasks());
    const firstId = firstGeneratedId;
    const secondId = secondGeneratedId;
    const thirdId = thirdGeneratedId;

    act(() => {
      replaceCollectionContents(
        ganttTasksCollection,
        [
          { id: firstId, name: "A", start: "2026-03-01", end: "2026-03-05", progress: 0 },
          {
            id: secondId,
            name: "B",
            start: "2026-03-02",
            end: "2026-03-06",
            progress: 0,
            dependencies: firstId,
          },
          {
            id: thirdId,
            name: "C",
            start: "2026-03-03",
            end: "2026-03-07",
            progress: 0,
            dependencies: [firstId, secondId].join(", "),
          },
        ],
        (task) => task.id,
      );
    });
    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === firstId)).toBe(true);
      expect(result.current.tasks.some((task) => task.id === secondId)).toBe(true);
      expect(result.current.tasks.some((task) => task.id === thirdId)).toBe(true);
    });

    act(() => {
      result.current.removeTask(firstId);
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === firstId)).toBe(false);
      expect(
        result.current.tasks.find((task) => task.id === secondId)?.dependencies,
      ).toBeUndefined();
      expect(result.current.tasks.find((task) => task.id === thirdId)?.dependencies).toBe(secondId);
    });
  });

  it("filters invalid tasks (bad date format)", async () => {
    const okId = nextId("ok");
    const badId = nextId("bad-format");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce(okId).mockReturnValueOnce(badId),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({ name: "Valid", start: "2026-02-01", end: "2026-02-03" });
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === okId)).toBe(true);
    });

    act(() => {
      result.current.addTask({ name: "Invalid", start: "bad-date", end: "2026-02-05" });
    });

    await waitFor(() => {
      expect(result.current.tasks.length).toBe(1);
      expect(result.current.tasks.some((task) => task.id === okId)).toBe(true);
      expect(result.current.tasks.some((task) => task.id === badId)).toBe(false);
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

  it("resets tasks when collection contents are replaced with an empty list", async () => {
    const taskId = nextId("reset-task");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => taskId),
    });

    const { result } = renderHook(() => useGanttTasks());

    act(() => {
      result.current.addTask({
        name: "Temporary task",
        start: "2026-04-03",
        end: "2026-04-04",
      });
    });

    await waitFor(() => {
      expect(result.current.tasks.some((task) => task.id === taskId)).toBe(true);
    });

    act(() => {
      replaceCollectionContents(ganttTasksCollection, [], (task) => task.id);
    });

    await waitFor(() => {
      expect(result.current.tasks).toEqual([]);
    });
  });
});
