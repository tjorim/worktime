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
  label?: string;
  labelId?: string;
  startTime: string;
  stopTime?: string | null;
};

type ImportPayload = {
  tasks?: unknown[];
  templates?: unknown[];
  labels?: unknown[];
};

type StoredTemplate = TimeTrackingTemplate & { label?: string };

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

  const labelId = typeof v.labelId === "string" ? v.labelId.trim() : "";
  const labelName = typeof v.label === "string" ? v.label.trim() : "";

  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    (labelId.length > 0 || labelName.length > 0) &&
    ISO_LOCAL_RE.test(startTime) &&
    isValidTaskDateRange(startTime, stopTime)
  );
}

// StoredTimeTrackingTask now has string timestamps, so it matches RawTask structure
function convertToTask(
  raw: RawTask,
  labelsById: Map<string, TimeTrackingLabel>,
  labelsByName: Map<string, TimeTrackingLabel>,
): StoredTimeTrackingTask {
  const rawLabelId = raw.labelId?.trim() ?? "";
  const rawLabelName = raw.label?.trim() ?? "";
  const labelById = rawLabelId ? labelsById.get(rawLabelId) : undefined;
  const labelByName = rawLabelName ? labelsByName.get(rawLabelName.toLowerCase()) : undefined;
  const resolvedLabel = labelById ?? labelByName;
  const resolvedLabelId = resolvedLabel?.id ?? rawLabelId ?? rawLabelName ?? "unknown-label";
  const resolvedLabelName = resolvedLabel?.name ?? rawLabelName;

  return {
    id: raw.id,
    text: raw.text,
    labelId: resolvedLabelId,
    labelName: resolvedLabelName,
    startTime: raw.startTime,
    stopTime: raw.stopTime ?? undefined,
  };
}

function isValidTemplate(value: unknown): value is TimeTrackingTemplate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const labelId = typeof v.labelId === "string" ? v.labelId.trim() : "";
  const labelName = typeof v.label === "string" ? v.label.trim() : "";
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    (labelId.length > 0 || labelName.length > 0) &&
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
    sanitized.push({
      id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
      name,
      color: value.color,
    });
  });

  return sanitized;
}

export function useTimeTrackingStorage() {
  const [rawTasks, setRawTasks] = useLocalStorage<RawTask[]>(TIME_TRACKING_STORAGE_KEYS.tasks, []);
  const [templates, setTemplates] = useLocalStorage<StoredTemplate[]>(
    TIME_TRACKING_STORAGE_KEYS.templates,
    [],
  );
  const [rawLabels, setRawLabels] = useLocalStorage<TimeTrackingLabel[]>(
    TIME_TRACKING_STORAGE_KEYS.labels,
    [],
  );

  const labels = useMemo(() => sanitizeLabels(rawLabels), [rawLabels]);

  const labelsById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels],
  );
  const labelsByName = useMemo(
    () => new Map(labels.map((label) => [label.name.toLowerCase(), label])),
    [labels],
  );

  const tasks = useMemo(
    () =>
      rawTasks
        .filter(isValidRawTask)
        .map((raw) => convertToTask(raw, labelsById, labelsByName)),
    [rawTasks, labelsById, labelsByName],
  );

  const normalizedTemplates = useMemo(() => {
    return templates
      .filter(isValidTemplate)
      .map((template) => {
        const record = template as Record<string, unknown>;
        const labelId =
          typeof record.labelId === "string"
            ? record.labelId
            : typeof record.label === "string"
              ? labelsByName.get(record.label.toLowerCase())?.id
              : undefined;
        const labelName =
          typeof record.labelId === "string"
            ? labelsById.get(record.labelId)?.name
            : typeof record.label === "string"
              ? record.label
              : undefined;
        if (!labelId) {
          return null;
        }
        return {
          id: record.id as string,
          text: record.text as string,
          labelId,
          labelName,
          start: record.start as string,
          stop: record.stop as string,
        };
      })
      .filter((template): template is TimeTrackingTemplate => template !== null);
  }, [templates, labelsByName, labelsById]);

  useEffect(() => {
    setRawTasks((prev) => {
      let changed = false;
      const next = prev.map((raw) => {
        if (!isValidRawTask(raw)) {
          return raw;
        }
        if (typeof raw.labelId === "string" && raw.labelId.trim().length > 0) {
          return raw;
        }
        const rawLabel = typeof raw.label === "string" ? raw.label.trim() : "";
        if (!rawLabel) {
          return raw;
        }
        const resolved = labelsByName.get(rawLabel.toLowerCase());
        if (!resolved) {
          return raw;
        }
        changed = true;
        return { ...raw, labelId: resolved.id };
      });
      return changed ? next : prev;
    });
  }, [labelsByName, setRawTasks]);

  useEffect(() => {
    setTemplates((prev) => {
      let changed = false;
      const next = prev.map((template) => {
        if (template.labelId && template.labelId.trim().length > 0) {
          return template;
        }
        const rawLabel = typeof template.label === "string" ? template.label.trim() : "";
        if (!rawLabel) {
          return template;
        }
        const resolved = labelsByName.get(rawLabel.toLowerCase());
        if (!resolved) {
          return template;
        }
        changed = true;
        return {
          ...template,
          labelId: resolved.id,
          labelName: resolved.name,
        };
      });
      return changed ? next : prev;
    });
  }, [labelsByName, setTemplates]);

  // Refs for stable exportData callback
  const rawTasksRef = useRef(rawTasks);
  const templatesRef = useRef(normalizedTemplates);
  const labelsRef = useRef(labels);

  // Synchronize refs with committed state to maintain stable references for callbacks
  useEffect(() => {
    rawTasksRef.current = rawTasks;
  }, [rawTasks]);

  useEffect(() => {
    templatesRef.current = normalizedTemplates;
  }, [normalizedTemplates]);

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  const addTask = useCallback(
    (payload: StoredTimeTrackingTask): Promise<boolean> => {
      const hasValidRunningTask = rawTasksRef.current.some(
        (task) => isValidRawTask(task) && (task.stopTime === undefined || task.stopTime === null),
      );
      if (payload.stopTime === undefined && hasValidRunningTask) {
        return Promise.resolve(false);
      }
      setRawTasks((prev) => [
        ...prev,
        {
          id: payload.id,
          text: payload.text,
          labelId: payload.labelId,
          label: payload.labelName,
          startTime: payload.startTime,
          stopTime: payload.stopTime ?? null,
        },
      ]);
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
      newLabelId?: string;
      newLabelName?: string;
    }) => {
      setRawTasks((prev) =>
        prev.map((raw) =>
          raw.id === payload.id
            ? {
                ...raw,
                text: payload.newText ?? raw.text,
                labelId: payload.newLabelId ?? raw.labelId,
                label: payload.newLabelName ?? raw.label,
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
        const mappedTemplates = validTemplates
          .map((template) => {
            const record = template as Record<string, unknown>;
            const labelId =
              typeof record.labelId === "string"
                ? record.labelId
                : typeof record.label === "string"
                  ? labelsByName.get(record.label.toLowerCase())?.id
                  : undefined;
            const labelName =
              typeof record.labelId === "string"
                ? labelsById.get(record.labelId)?.name
                : typeof record.label === "string"
                  ? record.label
                  : undefined;
            if (!labelId) {
              return null;
            }
            return {
              id: record.id as string,
              text: record.text as string,
              labelId,
              labelName,
              start: record.start as string,
              stop: record.stop as string,
            };
          })
          .filter((template): template is TimeTrackingTemplate => template !== null);
        setTemplates(mappedTemplates);
      }
      if (Array.isArray(payload.labels)) {
        setRawLabels(sanitizeLabels(payload.labels));
      }
    },
    [setRawTasks, setTemplates, setRawLabels, labelsById, labelsByName],
  );

  const updateLabels = useCallback(
    (nextLabels: TimeTrackingLabel[]) => {
      setRawLabels(sanitizeLabels(nextLabels));
    },
    [setRawLabels],
  );

  return {
    tasks,
    templates: normalizedTemplates,
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
