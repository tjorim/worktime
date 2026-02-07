import { useCallback, useMemo, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
  TIME_TRACKING_STORAGE_KEYS,
  isTimeTrackingTag,
} from "../components/timeTracking/constants";
import { isValidRange, isValidTimeString } from "../components/timeTracking/timeUtils";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "../components/timeTracking/types";

type RawTask = {
  id: string;
  text: string;
  tag: string;
  startTime: string;
  stopTime?: string | null;
};

type ImportPayload = {
  tasks?: unknown[];
  templates?: unknown[];
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
    isTimeTrackingTag(v.tag) &&
    ISO_LOCAL_RE.test(startTime) &&
    isValidTaskDateRange(startTime, stopTime)
  );
}

function migrateRawTask(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const v = value as Record<string, unknown>;
  if (
    typeof v.date === "string" &&
    typeof v.start === "string" &&
    typeof v.stop === "string" &&
    !("startTime" in v)
  ) {
    const { date, start, stop, ...rest } = v;
    return {
      ...rest,
      startTime: `${date}T${start}`,
      stopTime: `${date}T${stop}`,
    };
  }
  return value;
}

// StoredTimeTrackingTask now has string timestamps, so it matches RawTask structure
function convertToTask(raw: RawTask): StoredTimeTrackingTask {
  return {
    id: raw.id,
    text: raw.text,
    tag: raw.tag as StoredTimeTrackingTask["tag"],
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
    isTimeTrackingTag(v.tag) &&
    isValidTimeString(v.start) &&
    isValidTimeString(v.stop) &&
    isValidRange(v.start, v.stop)
  );
}

export function useTimeTrackingStorage() {
  const [rawTasks, setRawTasks] = useLocalStorage<RawTask[]>(TIME_TRACKING_STORAGE_KEYS.tasks, []);
  const [templates, setTemplates] = useLocalStorage<TimeTrackingTemplate[]>(
    TIME_TRACKING_STORAGE_KEYS.templates,
    [],
  );

  const tasks = useMemo(() => rawTasks.filter(isValidRawTask).map(convertToTask), [rawTasks]);

  // Refs for stable exportData callback
  const rawTasksRef = useRef(rawTasks);
  rawTasksRef.current = rawTasks;
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  const addTask = useCallback(
    (payload: StoredTimeTrackingTask) => {
      setRawTasks((prev) => [...prev, payload]);
    },
    [setRawTasks],
  );

  const updateTaskTimes = useCallback(
    (payload: {
      id: string;
      newStartTime: StoredTimeTrackingTask["startTime"];
      newStopTime: StoredTimeTrackingTask["stopTime"];
    }) => {
      setRawTasks((prev) =>
        prev.map((raw) =>
          raw.id === payload.id
            ? {
                ...raw,
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
        const migrated = payload.tasks.map(migrateRawTask);
        const validTasks = migrated.filter(isValidRawTask);
        setRawTasks(validTasks);
      }
      if (Array.isArray(payload.templates)) {
        const validTemplates = payload.templates.filter(isValidTemplate);
        setTemplates(validTemplates);
      }
    },
    [setRawTasks, setTemplates],
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
