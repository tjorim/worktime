import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
  TIME_TRACKING_STORAGE_KEYS,
  isTimeTrackingLabel,
  normalizeLabelName,
  type TimeTrackingLabel,
} from "../components/timeTracking/constants";
import { isValidRange, isValidTimeString } from "../components/timeTracking/timeUtils";
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
};

type ImportPayload = {
  tasks?: unknown[];
  templates?: unknown[];
  labels?: unknown[];
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
  return {
    id: raw.id,
    text: raw.text,
    label: raw.label as StoredTimeTrackingTask["label"],
    startTime: raw.startTime,
    stopTime: raw.stopTime ?? undefined,
  };
}

function isValidTemplate(value: unknown): value is TimeTrackingTemplate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.label === "string" &&
    v.label.trim().length > 0 &&
    isValidTimeString(v.start) &&
    isValidTimeString(v.stop) &&
    isValidRange(v.start, v.stop)
  );
}

function sanitizeLabels(labels: unknown[]): TimeTrackingLabel[] {
  const seen = new Set<string>();
  const sanitized: TimeTrackingLabel[] = [];

  labels.forEach((value) => {
    if (!isTimeTrackingLabel(value)) {
      return;
    }
    const name = normalizeLabelName(value.name);
    if (!name) {
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sanitized.push({ name, color: value.color });
  });

  return sanitized;
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

  // Refs for stable exportData callback
  const rawTasksRef = useRef(rawTasks);
  const templatesRef = useRef(templates);
  const labelsRef = useRef(labels);

  // Synchronize refs with committed state to maintain stable references for callbacks
  useEffect(() => {
    rawTasksRef.current = rawTasks;
  }, [rawTasks]);

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  const addTask = useCallback(
    (payload: StoredTimeTrackingTask): Promise<boolean> => {
      const hasValidRunningTask = rawTasksRef.current.some(
        (task) =>
          isValidRawTask(task) && (task.stopTime === undefined || task.stopTime === null),
      );
      if (payload.stopTime === undefined && hasValidRunningTask) {
        return Promise.resolve(false);
      }
      setRawTasks((prev) => [...prev, payload]);
      return Promise.resolve(true);
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
              }
            : raw,
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

  const exportData = useCallback((date: string) => {
    const payload = {
      tasks: rawTasksRef.current,
      templates: templatesRef.current,
      labels: labelsRef.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `worktime-time-tracking-${date}.json`;
    anchor.click();
    // Delay revocation to ensure the browser has time to start the download
    // before the object URL becomes invalid
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }, []);

  const importData = useCallback(
    (payload: ImportPayload) => {
      if (Array.isArray(payload.tasks)) {
        const validTasks = payload.tasks.filter(isValidRawTask);
        setRawTasks(validTasks);
      }
      if (Array.isArray(payload.templates)) {
        const validTemplates = payload.templates.filter(isValidTemplate);
        setTemplates(validTemplates);
      }
      if (Array.isArray(payload.labels)) {
        setRawLabels(sanitizeLabels(payload.labels));
      }
    },
    [setRawTasks, setTemplates, setRawLabels],
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
    removeTask,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    updateLabels,
    exportData,
    importData,
  };
}
