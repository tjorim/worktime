import { useCallback, useMemo } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import { useLocalStorage } from "./useLocalStorage";
import { TIME_TRACKING_STORAGE_KEYS } from "@/constants/storageKeys";
import { sanitizeLabels, type TimeTrackingLabel } from "@/components/timeTracking/constants";
import { isValidRange } from "@/components/timeTracking/timeUtils";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import { useOngoingSyncContext, emptySyncPayload } from "@/contexts/OngoingSyncContext";

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

  const { enqueueChange } = useOngoingSyncContext();

  const addTask = useCallback(
    async (payload: StoredTimeTrackingTask): Promise<boolean> => {
      // We resolve the Promise inside the setState updater to atomically check
      // current state and signal success/failure. React calls the updater
      // synchronously, so resolve() fires before microtask handlers run.
      // The Promise resolves before the state update is committed to the DOM.
      const success = await new Promise<boolean>((resolve) => {
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

      if (success) {
        const now = dayjs().toISOString();
        const change = emptySyncPayload();
        change.tasks.push({
          id: payload.id,
          action: "create",
          client_updated_at: now,
          label_id: payload.label || null,
          text: payload.text,
          start_time: dayjs(payload.startTime).toISOString(),
          stop_time: payload.stopTime ? dayjs(payload.stopTime).toISOString() : null,
          includes_break: payload.includesBreak ?? false,
        });
        enqueueChange(change);
      }
      return success;
    },
    [setRawTasks, enqueueChange],
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
      // Find the current raw task to get text/label if not provided in the payload.
      // Guard: skip enqueue if the task is not found — the state update above is
      // also a no-op in that case, so there is nothing to sync.
      const existing = rawTasks.find((t) => t.id === payload.id);
      if (existing) {
        const now = dayjs().toISOString();
        const change = emptySyncPayload();
        change.tasks.push({
          id: payload.id,
          action: "update",
          client_updated_at: now,
          label_id: (payload.newLabel ?? existing.label) || null,
          text: payload.newText ?? existing.text,
          start_time: dayjs(payload.newStartTime).toISOString(),
          stop_time: payload.newStopTime ? dayjs(payload.newStopTime).toISOString() : null,
          includes_break:
            typeof payload.includesBreak === "boolean"
              ? payload.includesBreak
              : (existing.includesBreak ?? false),
        });
        enqueueChange(change);
      }
    },
    [setRawTasks, rawTasks, enqueueChange],
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
      const now = dayjs().toISOString();
      const existing = rawTasks.find((t) => t.id === taskId);
      if (existing) {
        const change = emptySyncPayload();
        change.tasks.push({
          id: taskId,
          action: "update",
          client_updated_at: now,
          label_id: existing.label || null,
          text: existing.text,
          start_time: dayjs(existing.startTime).toISOString(),
          stop_time: existing.stopTime ? dayjs(existing.stopTime).toISOString() : null,
          includes_break: includesBreak,
        });
        enqueueChange(change);
      }
    },
    [setRawTasks, rawTasks, enqueueChange],
  );

  const removeTask = useCallback(
    (id: string) => {
      setRawTasks((prev) => prev.filter((raw) => raw.id !== id));
      const now = dayjs().toISOString();
      const change = emptySyncPayload();
      change.tasks.push({ id, action: "delete", client_updated_at: now });
      enqueueChange(change);
    },
    [setRawTasks, enqueueChange],
  );

  const addTemplate = useCallback(
    (payload: Omit<TimeTrackingTemplate, "id">) => {
      const id = crypto.randomUUID();
      setTemplates((prev) => [...prev, { id, ...payload }]);
      const now = dayjs().toISOString();
      const change = emptySyncPayload();
      change.templates.push({
        id,
        action: "create",
        client_updated_at: now,
        label_id: payload.label || null,
        text: payload.text,
        start_time: `${payload.start}:00`,
        stop_time: `${payload.stop}:00`,
      });
      enqueueChange(change);
    },
    [setTemplates, enqueueChange],
  );

  const updateTemplate = useCallback(
    (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => {
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === payload.id ? { id: payload.id, ...payload.template } : template,
        ),
      );
      const now = dayjs().toISOString();
      const change = emptySyncPayload();
      change.templates.push({
        id: payload.id,
        action: "update",
        client_updated_at: now,
        label_id: payload.template.label || null,
        text: payload.template.text,
        start_time: `${payload.template.start}:00`,
        stop_time: `${payload.template.stop}:00`,
      });
      enqueueChange(change);
    },
    [setTemplates, enqueueChange],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((template) => template.id !== id));
      const now = dayjs().toISOString();
      const change = emptySyncPayload();
      change.templates.push({ id, action: "delete", client_updated_at: now });
      enqueueChange(change);
    },
    [setTemplates, enqueueChange],
  );

  const updateTemplates = useCallback(
    (nextTemplates: TimeTrackingTemplate[]) => {
      const now = dayjs().toISOString();
      const change = emptySyncPayload();
      // Use "create" for all templates in the list — the backend treats "create"
      // as an upsert, so existing templates are updated rather than duplicated.
      for (const t of nextTemplates) {
        change.templates.push({
          id: t.id,
          action: "create",
          client_updated_at: now,
          label_id: t.label || null,
          text: t.text,
          start_time: `${t.start}:00`,
          stop_time: `${t.stop}:00`,
        });
      }
      // Delete templates that were removed.
      const nextIds = new Set(nextTemplates.map((t) => t.id));
      for (const t of templates) {
        if (!nextIds.has(t.id)) {
          change.templates.push({ id: t.id, action: "delete", client_updated_at: now });
        }
      }
      setTemplates(nextTemplates);
      enqueueChange(change);
    },
    [setTemplates, templates, enqueueChange],
  );

  const updateLabels = useCallback(
    (nextLabels: TimeTrackingLabel[]) => {
      const sanitized = sanitizeLabels(nextLabels);
      const now = dayjs().toISOString();
      const change = emptySyncPayload();
      // Use "create" for all labels in the list — the backend treats "create"
      // as an upsert, so existing labels are updated rather than duplicated.
      for (const l of sanitized) {
        change.labels.push({
          id: l.id,
          action: "create",
          client_updated_at: now,
          name: l.name,
          color: l.color,
        });
      }
      // Delete labels that were removed.
      const nextIds = new Set(sanitized.map((l) => l.id));
      for (const l of rawLabels) {
        if (!nextIds.has(l.id)) {
          change.labels.push({ id: l.id, action: "delete", client_updated_at: now });
        }
      }
      setRawLabels(sanitized);
      enqueueChange(change);
    },
    [setRawLabels, rawLabels, enqueueChange],
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
