import { useCallback, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { isValidRawGanttTask, type GanttTask, type RawGanttTask } from "@/types/gantt";
import { ganttTasksCollection } from "@/db/collections";

export type NewGanttTaskInput = Omit<RawGanttTask, "id">;

export type GanttTaskChanges = Partial<Omit<RawGanttTask, "id">>;

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
      id: crypto.randomUUID(),
      name: payload.name,
      start: payload.start,
      end: payload.end,
      progress: payload.progress ?? 0,
      ...(payload.dependencies ? { dependencies: payload.dependencies } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    };
    ganttTasksCollection.insert(createdTask);
    return toTask(createdTask);
  }, []);

  const updateTask = useCallback((id: string, changes: GanttTaskChanges) => {
    if (!ganttTasksCollection.has(id)) return;
    ganttTasksCollection.update(id, (d) => {
      if (changes.name !== undefined) d.name = changes.name;
      if (changes.start !== undefined) d.start = changes.start;
      if (changes.end !== undefined) d.end = changes.end;
      d.progress = changes.progress ?? d.progress ?? 0;
      if (changes.dependencies !== undefined)
        d.dependencies = changes.dependencies ?? undefined;
      if (changes.notes !== undefined) d.notes = changes.notes ?? undefined;
    });
  }, []);

  const removeTask = useCallback((id: string) => {
    if (!ganttTasksCollection.has(id)) return;

    // Clean up dependency references in other tasks before deleting
    const all = ganttTasksCollection.toArray as GanttTask[];
    for (const raw of all) {
      if (!raw.dependencies || raw.id === id) continue;
      const parts = raw.dependencies.split(",").map((d) => d.trim());
      if (parts.includes(id)) {
        const cleaned = parts.filter((d) => d && d !== id).join(", ");
        ganttTasksCollection.update(raw.id, (d) => {
          d.dependencies = cleaned || undefined;
        });
      }
    }

    ganttTasksCollection.delete(id);
  }, []);

  return {
    tasks,
    addTask,
    updateTask,
    removeTask,
  };
}
