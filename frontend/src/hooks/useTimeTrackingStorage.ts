import { useCallback, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { dayjs } from "@/utils/dateTimeUtils";
import { sanitizeLabels, type Label } from "@/components/timeTracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/components/timeTracking/types";
import {
  labelsCollection,
  hasSyncCollectionAuth,
  replaceCollectionContents,
  runMutationBatch,
  tasksCollection,
  templatesCollection,
} from "@/db/collections";

type RawTask = {
  id: string;
  text: string;
  label: string;
  startTime: string;
  stopTime?: string | null;
  includesBreak?: boolean;
  ganttTaskId?: string;
};

const ISO_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function isValidTaskDateRange(startTime: string, stopTime?: string | null): boolean {
  if (!stopTime) {
    return true;
  }

  const start = dayjs(startTime);
  const stop = dayjs(stopTime);

  if (!start.isValid() || !stop.isValid()) {
    return false;
  }

  if (!start.isSame(stop, "day")) {
    return false;
  }

  return start.isBefore(stop);
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
  if (v.ganttTaskId !== undefined && typeof v.ganttTaskId !== "string") {
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
function convertToTask(raw: StoredTimeTrackingTask): StoredTimeTrackingTask {
  return {
    id: raw.id,
    text: raw.text,
    label: raw.label,
    startTime: raw.startTime,
    stopTime: raw.stopTime,
    ...(raw.includesBreak === true ? { includesBreak: true } : {}),
    ...(raw.ganttTaskId ? { ganttTaskId: raw.ganttTaskId } : {}),
  };
}

export function useTimeTrackingStorage() {
  const { data: rawTaskData } = useLiveQuery(tasksCollection);
  const { data: rawTemplateData } = useLiveQuery(templatesCollection);
  const { data: rawLabelData } = useLiveQuery(labelsCollection);

  const tasks = useMemo(
    () =>
      ((rawTaskData ?? []) as StoredTimeTrackingTask[]).filter(isValidRawTask).map(convertToTask),
    [rawTaskData],
  );

  const templates = useMemo(
    () => (rawTemplateData ?? []) as TimeTrackingTemplate[],
    [rawTemplateData],
  );

  const labels = useMemo(
    () => sanitizeLabels((rawLabelData ?? []) as Label[]),
    [rawLabelData],
  );

  const addTask = useCallback(
    async (payload: StoredTimeTrackingTask): Promise<boolean> => {
      const hasValidRunningTask = tasks.some(
        (task) => task.stopTime === undefined || task.stopTime === null,
      );
      if (payload.stopTime == null && hasValidRunningTask) {
        return false;
      }
      const newTask: StoredTimeTrackingTask = {
        id: payload.id,
        text: payload.text,
        label: payload.label,
        startTime: payload.startTime,
        stopTime: payload.stopTime ?? undefined,
        ganttTaskId: payload.ganttTaskId || undefined,
      };
      if (payload.includesBreak === true) {
        newTask.includesBreak = true;
      }
      tasksCollection.insert(newTask);
      return true;
    },
    [tasks],
  );

  const updateTaskTimes = useCallback(
    (payload: {
      id: string;
      newStartTime: StoredTimeTrackingTask["startTime"];
      newStopTime: StoredTimeTrackingTask["stopTime"];
      newText?: string;
      newLabel?: string;
      includesBreak?: boolean;
      ganttTaskId?: string;
    }) => {
      if (!tasks.some((task) => task.id === payload.id)) return;
      tasksCollection.update(payload.id, (d) => {
        if (payload.newText !== undefined) d.text = payload.newText;
        if (payload.newLabel !== undefined) d.label = payload.newLabel;
        d.startTime = payload.newStartTime;
        d.stopTime = payload.newStopTime ?? undefined;
        if (payload.ganttTaskId !== undefined) d.ganttTaskId = payload.ganttTaskId || undefined;
        if (typeof payload.includesBreak === "boolean") {
          d.includesBreak = payload.includesBreak || undefined;
        }
      });
    },
    [tasks],
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
      if (!tasks.some((task) => task.id === taskId)) return;
      tasksCollection.update(taskId, (d) => {
        d.includesBreak = includesBreak || undefined;
      });
    },
    [tasks],
  );

  const removeTask = useCallback(
    (id: string) => {
      if (!tasks.some((task) => task.id === id)) return;
      if (!hasSyncCollectionAuth()) {
        const remainingTasks = tasks.filter((task) => task.id !== id);
        replaceCollectionContents(tasksCollection, remainingTasks, (task) => task.id);
        return;
      }
      tasksCollection.delete(id);
    },
    [tasks],
  );

  const addTemplate = useCallback((payload: Omit<TimeTrackingTemplate, "id">) => {
    const id = crypto.randomUUID();
    templatesCollection.insert({ id, ...payload });
  }, []);

  const updateTemplate = useCallback(
    (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => {
      if (!templates.some((template) => template.id === payload.id)) return;
      templatesCollection.update(payload.id, (d) => {
        Object.assign(d, payload.template);
      });
    },
    [templates],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      if (!templates.some((template) => template.id === id)) return;
      if (!hasSyncCollectionAuth()) {
        const remainingTemplates = templates.filter((template) => template.id !== id);
        replaceCollectionContents(
          templatesCollection,
          remainingTemplates,
          (template) => template.id,
        );
        return;
      }
      templatesCollection.delete(id);
    },
    [templates],
  );

  const updateTemplates = useCallback((nextTemplates: TimeTrackingTemplate[]) => {
    const nextIds = new Set(nextTemplates.map((t) => t.id));
    const toDelete = (templatesCollection.toArray as TimeTrackingTemplate[]).filter(
      (t) => !nextIds.has(t.id),
    );
    const hasWork = nextTemplates.length > 0 || toDelete.length > 0;
    runMutationBatch(templatesCollection, hasWork, () => {
      // Upsert all templates in the new list
      for (const t of nextTemplates) {
        if (templatesCollection.has(t.id)) {
          templatesCollection.update(t.id, (d) => {
            Object.assign(d, t);
          });
        } else {
          templatesCollection.insert(t);
        }
      }
      // Delete templates not in the new list
      for (const t of toDelete) {
        templatesCollection.delete(t.id);
      }
    });
  }, []);

  const updateLabels = useCallback((nextLabels: Label[]) => {
    const sanitized = sanitizeLabels(nextLabels);
    const nextIds = new Set(sanitized.map((l) => l.id));
    const toDelete = (labelsCollection.toArray as Label[]).filter(
      (l) => !nextIds.has(l.id),
    );
    const hasWork = sanitized.length > 0 || toDelete.length > 0;
    runMutationBatch(labelsCollection, hasWork, () => {
      // Upsert all labels in the new list
      for (const l of sanitized) {
        if (labelsCollection.has(l.id)) {
          labelsCollection.update(l.id, (d) => {
            Object.assign(d, l);
          });
        } else {
          labelsCollection.insert(l);
        }
      }
      // Delete labels not in the new list
      for (const l of toDelete) {
        labelsCollection.delete(l.id);
      }
    });
  }, []);

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
