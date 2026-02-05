import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { TIME_TRACKING_STORAGE_KEYS } from "../components/timeTracking/constants";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../components/timeTracking/types";

type ImportPayload = {
  tasks?: StoredTimeTrackingTask[];
  templates?: TimeTrackingTemplate[];
};

export function useTimeTrackingStorage() {
  const [tasks, setTasks] = useLocalStorage<StoredTimeTrackingTask[]>(
    TIME_TRACKING_STORAGE_KEYS.tasks,
    [],
  );
  const [templates, setTemplates] = useLocalStorage<TimeTrackingTemplate[]>(
    TIME_TRACKING_STORAGE_KEYS.templates,
    [],
  );

  const addTask = useCallback(
    (payload: StoredTimeTrackingTask) => {
      setTasks((prev) => [...prev, payload]);
    },
    [setTasks],
  );

  const updateTaskTimes = useCallback(
    (payload: { date: string; id: string; newStart: string; newStop: string }) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === payload.id && task.date === payload.date
            ? { ...task, start: payload.newStart, stop: payload.newStop }
            : task,
        ),
      );
    },
    [setTasks],
  );

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== id));
    },
    [setTasks],
  );

  const addTemplate = useCallback(
    (payload: Omit<TimeTrackingTemplate, "id">) => {
      setTemplates((prev) => {
        const maxId = prev.reduce((max, template) => Math.max(max, template.id), 0);
        return [...prev, { id: maxId + 1, ...payload }];
      });
    },
    [setTemplates],
  );

  const updateTemplate = useCallback(
    (payload: { id: number; template: Omit<TimeTrackingTemplate, "id"> }) => {
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === payload.id ? { id: payload.id, ...payload.template } : template,
        ),
      );
    },
    [setTemplates],
  );

  const deleteTemplate = useCallback(
    (id: number) => {
      setTemplates((prev) => prev.filter((template) => template.id !== id));
    },
    [setTemplates],
  );

  const exportData = useCallback(
    (date: string) => {
      const payload = {
        tasks,
        templates,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `worktime-time-tracking-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [tasks, templates],
  );

  const importData = useCallback(
    (payload: ImportPayload) => {
      if (Array.isArray(payload.tasks)) {
        setTasks(payload.tasks);
      }
      if (Array.isArray(payload.templates)) {
        setTemplates(payload.templates);
      }
    },
    [setTasks, setTemplates],
  );

  return {
    tasks,
    templates,
    addTask,
    updateTaskTimes,
    removeTask,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    exportData,
    importData,
  };
}
