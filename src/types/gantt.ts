import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

function isValidISODate(value: string): boolean {
  return dayjs(value, "YYYY-MM-DD", true).isValid();
}

export interface GanttTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
  notes?: string;
}

export type RawGanttTask = Omit<GanttTask, "progress"> & {
  progress?: number;
};

function isValidProgress(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isValidRawGanttTask(value: unknown): value is RawGanttTask {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const task = value as Record<string, unknown>;
  if (
    typeof task.id !== "string" ||
    typeof task.name !== "string" ||
    typeof task.start !== "string" ||
    typeof task.end !== "string"
  ) {
    return false;
  }

  if (!isValidISODate(task.start) || !isValidISODate(task.end)) {
    return false;
  }

  if (task.progress !== undefined && !isValidProgress(task.progress)) {
    return false;
  }

  if (task.dependencies !== undefined && typeof task.dependencies !== "string") {
    return false;
  }

  if (task.notes !== undefined && typeof task.notes !== "string") {
    return false;
  }

  return true;
}
