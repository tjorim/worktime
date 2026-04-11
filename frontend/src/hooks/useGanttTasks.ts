import { useCallback, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { isValidRawGanttTask, type GanttTask, type RawGanttTask } from "@/types/gantt";
import {
  ganttTasksCollection,
  hasSyncCollectionAuth,
  replaceCollectionContents,
} from "@/db/collections";

export type NewGanttTaskInput = Omit<RawGanttTask, "id">;

export type GanttTaskChanges = Partial<Omit<RawGanttTask, "id">>;

function generateTaskId(): string {
  const candidate = globalThis.crypto?.randomUUID?.();
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : `gantt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toTask(raw: RawGanttTask | GanttTask): GanttTask {
  return {
    id: raw.id,
    name: raw.name,
    start: raw.start,
    end: raw.end,
    progress: raw.progress ?? 0,
    ...(raw.dependencies ? { dependencies: raw.dependencies } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
  };
}

export function useGanttTasks() {
  const { data: rawData } = useLiveQuery(ganttTasksCollection);

  const tasks = useMemo(
    () => ((rawData ?? []) as RawGanttTask[]).filter(isValidRawGanttTask).map(toTask),
    [rawData],
  );

  const addTask = useCallback((payload: NewGanttTaskInput) => {
    const createdTask: GanttTask = {
      id: generateTaskId(),
      name: payload.name,
      start: payload.start,
      end: payload.end,
      progress: payload.progress ?? 0,
      ...(payload.dependencies ? { dependencies: payload.dependencies } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    };
    if (!hasSyncCollectionAuth()) {
      replaceCollectionContents(
        ganttTasksCollection,
        [...(ganttTasksCollection.toArray as GanttTask[]), createdTask],
        (task) => task.id,
      );
    } else {
      ganttTasksCollection.insert(createdTask);
    }
    return toTask(createdTask);
  }, []);

  const updateTask = useCallback((id: string, changes: GanttTaskChanges) => {
    if (!tasks.some((task) => task.id === id)) return;

    if (!hasSyncCollectionAuth()) {
      const nextTasks = tasks.map((task) =>
        task.id === id
          ? {
            ...task,
            ...(changes.name !== undefined ? { name: changes.name } : {}),
            ...(changes.start !== undefined ? { start: changes.start } : {}),
            ...(changes.end !== undefined ? { end: changes.end } : {}),
            progress: changes.progress ?? task.progress ?? 0,
            ...(changes.dependencies !== undefined ? { dependencies: changes.dependencies ?? undefined } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes ?? undefined } : {}),
          }
          : task,
      );
      replaceCollectionContents(ganttTasksCollection, nextTasks, (task) => task.id);
      return;
    }

    ganttTasksCollection.update(id, (d) => {
      if (changes.name !== undefined) d.name = changes.name;
      if (changes.start !== undefined) d.start = changes.start;
      if (changes.end !== undefined) d.end = changes.end;
      d.progress = changes.progress ?? d.progress ?? 0;
      if (changes.dependencies !== undefined) d.dependencies = changes.dependencies ?? undefined;
      if (changes.notes !== undefined) d.notes = changes.notes ?? undefined;
    });
  }, [tasks]);

  const removeTask = useCallback((id: string) => {
    if (!tasks.some((task) => task.id === id)) return;

    // Clean up dependency references in other tasks before deleting
    const nextTasks = tasks
      .filter((task) => task.id !== id)
      .map((task) => {
        if (!task.dependencies) return task;
        const parts = task.dependencies.split(",").map((d) => d.trim());
        if (!parts.includes(id)) return task;
        const cleaned = parts.filter((d) => d && d !== id).join(", ");
        return {
          ...task,
          dependencies: cleaned || undefined,
        };
      });

    if (!hasSyncCollectionAuth()) {
      replaceCollectionContents(ganttTasksCollection, nextTasks, (task) => task.id);
      return;
    }

    ganttTasksCollection.delete(id);
    // Update dependency strings in affected tasks using proper mutation API
    for (const task of nextTasks) {
      const original = tasks.find((t) => t.id === task.id);
      if (original && original.dependencies !== task.dependencies) {
        ganttTasksCollection.update(task.id, (d) => {
          d.dependencies = task.dependencies;
        });
      }
    }
  }, [tasks]);

  return {
    tasks,
    addTask,
    updateTask,
    removeTask,
  };
}
