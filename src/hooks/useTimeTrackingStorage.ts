import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { sanitizeLabels } from "../components/timeTracking/labelUtils";
import type { TimeTrackingLabel } from "../components/timeTracking/labelTypes";
import { TIME_TRACKING_STORAGE_KEYS } from "../constants/storageKeys";
import { isValidRange } from "../components/timeTracking/timeUtils";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../components/timeTracking/types";

type RawTask = {
  id: string;
  text: string;
  label: string;
  startTime: string;
  stopTime?: string | null;
  includesBreak?: boolean;
};

const ISO_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function isValidTaskDateRange(startTime: string, stopTime?: string | null): boolean {
  if (!stopTime) {
    return true;
  }

  const startDate = startTime.slice(0, 10);
  const stopDate = stopTime.slice(0, 10);
  if (startDate !== stopDate) {
    return false;
  }

  const startClock = startTime.slice(11, 16);
  const stopClock = stopTime.slice(11, 16);
  return isValidRange(startClock, stopClock);
}

function isValidRawTask(value: unknown): value is RawTask {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const hasValidStopValue =
    v.stopTime === undefined ||
    v.stopTime === null ||
    (typeof v.stopTime === "string" && ISO_LOCAL_RE.test(v.stopTime));

  if (!hasValidStopValue) {
    return false;
  }

  if (v.includesBreak !== undefined && typeof v.includesBreak !== "boolean") {
    return false;
  }

  const startTime = typeof v.startTime === "string" ? v.startTime : "";
  const stopTime = typeof v.stopTime === "string" ? v.stopTime : null;

  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.label === "string" &&
    v.label.trim().length > 0 &&
    ISO_LOCAL_RE.test(startTime) &&
    isValidTaskDateRange(startTime, stopTime)
  );
}

// StoredTimeTrackingTask now has string timestamps, so it matches RawTask structure
function convertToTask(raw: RawTask): StoredTimeTrackingTask {
  const task: StoredTimeTrackingTask = {
    id: raw.id,
    text: raw.text,
    label: raw.label,
    startTime: raw.startTime,
    stopTime: raw.stopTime ?? undefined,
  };
  if (raw.includesBreak === true) {
    task.includesBreak = true;
  }
  return task;
}

export function useTimeTrackingStorage() {
  const [rawTasks, setRawTasks] = useLocalStorage<RawTask[]>(TIME_TRACKING_STORAGE_KEYS.tasks, []);
  const [templates, setTemplates] = useLocalStorage<TimeTrackingTemplate[]>(
    TIME_TRACKING_STORAGE_KEYS.templates,
    [],
  );
  const [rawLabels, setRawLabels] = useLocalStorage<TimeTrackingLabel[]>(
    TIME_TRACKING_STORAGE_KEYS.labels,
    [],
  );

  const labels = useMemo(() => sanitizeLabels(rawLabels), [rawLabels]);

  const tasks = useMemo(() => rawTasks.filter(isValidRawTask).map(convertToTask), [rawTasks]);

  const addTask = useCallback(
    (payload: StoredTimeTrackingTask): Promise<boolean> => {
      // We resolve the Promise inside the setState updater to atomically check
      // current state and signal success/failure. React calls the updater
      // synchronously, so resolve() fires before microtask handlers run.
      // The Promise resolves before the state update is committed to the DOM.
      return new Promise((resolve) => {
        setRawTasks((prev) => {
          // Check if a running task already exists in the current state
          const hasValidRunningTask = prev.some(
            (task) =>
              isValidRawTask(task) && (task.stopTime === undefined || task.stopTime === null),
          );
          // If user is trying to add an unstopped task and a running task exists, reject
          if (payload.stopTime === undefined && hasValidRunningTask) {
            resolve(false);
            return prev; // No state change
          }
          // Otherwise append the new task
          resolve(true);
          const newTask: RawTask = {
            id: payload.id,
            text: payload.text,
            label: payload.label,
            startTime: payload.startTime,
            stopTime: payload.stopTime ?? null,
          };
          if (payload.includesBreak === true) {
            newTask.includesBreak = true;
          }
          return [...prev, newTask];
        });
      });
    },
    [setRawTasks],
  );

  const updateTaskTimes = useCallback(
    (payload: {
      id: string;
      newStartTime: StoredTimeTrackingTask["startTime"];
      newStopTime: StoredTimeTrackingTask["stopTime"];
      newText?: string;
      newLabel?: string;
      includesBreak?: boolean;
    }) => {
      setRawTasks((prev) =>
        prev.map((raw) =>
          raw.id === payload.id
            ? {
                ...raw,
                text: payload.newText ?? raw.text,
                label: payload.newLabel ?? raw.label,
                startTime: payload.newStartTime,
                stopTime: payload.newStopTime ?? null,
                includesBreak:
                  typeof payload.includesBreak === "boolean"
                    ? payload.includesBreak || undefined
                    : raw.includesBreak,
              }
            : raw,
        ),
      );
    },
    [setRawTasks],
  );

  /**
   * Toggle the break deduction flag on a task.
   *
   * @param taskId - ID of the task to update.
   * @param includesBreak - When `true`, a 30-minute break is deducted from the
   *   task's effective duration. When `false`, the flag is removed (`undefined`
   *   in storage) so no deduction applies.
   *
   * If `taskId` does not match any stored task the call is a no-op.
   */
  const toggleBreak = useCallback(
    (taskId: string, includesBreak: boolean) => {
      setRawTasks((prev) =>
        prev.map((raw) =>
          raw.id === taskId ? { ...raw, includesBreak: includesBreak || undefined } : raw,
        ),
      );
    },
    [setRawTasks],
  );

  const removeTask = useCallback(
    (id: string) => {
      setRawTasks((prev) => prev.filter((raw) => raw.id !== id));
    },
    [setRawTasks],
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

  const updateTemplates = useCallback(
    (nextTemplates: TimeTrackingTemplate[]) => {
      setTemplates(nextTemplates);
    },
    [setTemplates],
  );

  const updateLabels = useCallback(
    (nextLabels: TimeTrackingLabel[]) => {
      setRawLabels(sanitizeLabels(nextLabels));
    },
    [setRawLabels],
  );

  return {
    tasks,
    templates,
    labels,
    addTask,
    updateTaskTimes,
    toggleBreak,
    removeTask,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    updateTemplates,
    updateLabels,
  };
}
