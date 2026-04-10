import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { isValidRawGanttTask, type GanttTask, type RawGanttTask } from "@/types/gantt";
import { GANTT_STORAGE_KEY } from "@/constants/storageKeys";
import { emptySyncPayload, useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { dayjs } from "@/utils/dateTimeUtils";

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
  const { enqueueChange } = useOngoingSyncContext();

  const tasks = useMemo(() => rawTasks.filter(isValidRawGanttTask).map(toTask), [rawTasks]);

  const addTask = useCallback(
    (payload: NewGanttTaskInput) => {
      const now = dayjs().toISOString();
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

      const change = emptySyncPayload();
      change.gantt_tasks.push({
        id: createdTask.id,
        action: "create",
        client_updated_at: now,
        name: createdTask.name,
        start_date: createdTask.start,
        end_date: createdTask.end,
        progress: createdTask.progress ?? 0,
        dependencies: createdTask.dependencies ?? null,
        notes: createdTask.notes ?? null,
      });
      enqueueChange(change);

      return toTask(createdTask);
    },
    [setRawTasks, enqueueChange],
  );

  const updateTask = useCallback(
    (id: string, changes: GanttTaskChanges) => {
      const now = dayjs().toISOString();
      setRawTasks((prev) =>
        prev.map((raw) => {
          if (raw.id !== id) return raw;
          return { ...raw, ...changes, progress: changes.progress ?? raw.progress ?? 0 };
        }),
      );

      const change = emptySyncPayload();
      change.gantt_tasks.push({
        id,
        action: "update",
        client_updated_at: now,
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.start !== undefined ? { start_date: changes.start } : {}),
        ...(changes.end !== undefined ? { end_date: changes.end } : {}),
        ...(changes.progress !== undefined ? { progress: changes.progress } : {}),
        ...(changes.dependencies !== undefined ? { dependencies: changes.dependencies ?? null } : {}),
        ...(changes.notes !== undefined ? { notes: changes.notes ?? null } : {}),
      });
      enqueueChange(change);
    },
    [setRawTasks, enqueueChange],
  );

  const removeTask = useCallback(
    (id: string) => {
      const now = dayjs().toISOString();
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

      const change = emptySyncPayload();
      change.gantt_tasks.push({ id, action: "delete", client_updated_at: now });
      enqueueChange(change);
    },
    [setRawTasks, enqueueChange],
  );

  return {
    tasks,
    addTask,
    updateTask,
    removeTask,
  };
}
