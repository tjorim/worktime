import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { isValidRawGanttTask, type GanttTask, type RawGanttTask } from "../types/gantt";
import { GANTT_STORAGE_KEY } from "../constants/storageKeys";

export { GANTT_STORAGE_KEY };

export type NewGanttTaskInput = Omit<RawGanttTask, "id">;

export type GanttTaskChanges = Partial<Omit<RawGanttTask, "id">>;

function toTask(raw: RawGanttTask): GanttTask {
  return {
    ...raw,
    progress: raw.progress ?? 0,
  };
}

export function useGanttTasks() {
  const [rawTasks, setRawTasks] = useLocalStorage<RawGanttTask[]>(GANTT_STORAGE_KEY, []);

  const tasks = useMemo(() => rawTasks.filter(isValidRawGanttTask).map(toTask), [rawTasks]);

  const addTask = useCallback(
    (payload: NewGanttTaskInput) => {
      const createdTask: RawGanttTask = {
        id: crypto.randomUUID(),
        name: payload.name,
        start: payload.start,
        end: payload.end,
        progress: payload.progress ?? 0,
        dependencies: payload.dependencies,
        notes: payload.notes,
      };

      setRawTasks((prev) => [...prev, createdTask]);

      return toTask(createdTask);
    },
    [setRawTasks],
  );

  const updateTask = useCallback(
    (id: string, changes: GanttTaskChanges) => {
      setRawTasks((prev) =>
        prev.map((raw) => {
          if (raw.id !== id) {
            return raw;
          }

          return {
            ...raw,
            ...changes,
            progress: changes.progress ?? raw.progress ?? 0,
          };
        }),
      );
    },
    [setRawTasks],
  );

  const removeTask = useCallback(
    (id: string) => {
      setRawTasks((prev) =>
        prev
          .filter((raw) => raw.id !== id)
          .map((raw) => {
            if (!raw.dependencies) return raw;
            const cleaned = raw.dependencies
              .split(",")
              .map((d) => d.trim())
              .filter((d) => d && d !== id)
              .join(", ");
            return { ...raw, dependencies: cleaned || undefined };
          }),
      );
    },
    [setRawTasks],
  );

  return {
    tasks,
    addTask,
    updateTask,
    removeTask,
  };
}
