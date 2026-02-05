import { useCallback, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
  TIME_TRACKING_STORAGE_KEYS,
  isTimeTrackingTag,
} from "../components/timeTracking/constants";
import { isValidTimeString } from "../components/timeTracking/timeUtils";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../components/timeTracking/types";

type ImportPayload = {
  tasks?: unknown[];
  templates?: unknown[];
};

function isValidTask(value: unknown): value is StoredTimeTrackingTask {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.date === "string" &&
    typeof v.text === "string" &&
    isTimeTrackingTag(v.tag) &&
    isValidTimeString(v.start) &&
    isValidTimeString(v.stop)
  );
}

function isValidTemplate(value: unknown): value is TimeTrackingTemplate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    isTimeTrackingTag(v.tag) &&
    isValidTimeString(v.start) &&
    isValidTimeString(v.stop)
  );
}

export function useTimeTrackingStorage() {
  const [tasks, setTasks] = useLocalStorage<StoredTimeTrackingTask[]>(
    TIME_TRACKING_STORAGE_KEYS.tasks,
    [],
  );
  const [templates, setTemplates] = useLocalStorage<TimeTrackingTemplate[]>(
    TIME_TRACKING_STORAGE_KEYS.templates,
    [],
  );

  // Refs for stable exportData callback (item #2: avoids stale closure)
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

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
      setTemplates((prev) => [...prev, { id: crypto.randomUUID(), ...payload }]);
    },
    [setTemplates],
  );

  const updateTemplate = useCallback(
    (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => {
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === payload.id ? { id: payload.id, ...payload.template } : template,
        ),
      );
    },
    [setTemplates],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((template) => template.id !== id));
    },
    [setTemplates],
  );

  const exportData = useCallback(
    (date: string) => {
      const payload = {
        tasks: tasksRef.current,
        templates: templatesRef.current,
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
    [],
  );

  const importData = useCallback(
    (payload: ImportPayload) => {
      if (Array.isArray(payload.tasks)) {
        const validTasks = payload.tasks.filter(isValidTask);
        setTasks(validTasks);
      }
      if (Array.isArray(payload.templates)) {
        const validTemplates = payload.templates.filter(isValidTemplate);
        setTemplates(validTemplates);
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
