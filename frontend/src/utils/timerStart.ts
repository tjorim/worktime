import type { Dayjs } from "dayjs";
import { TIMER_EXACT_START_STORAGE_KEY } from "@/constants/storageKeys";
import { dayjs } from "@/utils/dateTimeUtils";

/**
 * Tasks are stored with minute precision, so a task started at 10:15:40 is stored as 10:15. The exact
 * click time is kept for the session only, so the running timer starts at 00:00:00 and the "shorter
 * than a minute" check measures what the user actually saw. It is ignored unless it belongs to the
 * running task and falls inside the stored start minute.
 */

interface ExactStart {
  taskId: string;
  startedAt: string;
}

export function rememberExactTimerStart(taskId: string, startedAt: Dayjs): void {
  try {
    const value: ExactStart = { taskId, startedAt: startedAt.toISOString() };
    sessionStorage.setItem(TIMER_EXACT_START_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the timer then counts from the stored minute.
  }
}

/** The moment the running task really started: the remembered click time, else the stored minute. */
export function getTimerStart(task: { id: string; startTime: string }): Dayjs {
  const stored = dayjs(task.startTime);
  try {
    const raw = sessionStorage.getItem(TIMER_EXACT_START_STORAGE_KEY);
    if (!raw) return stored;
    const parsed = JSON.parse(raw) as Partial<ExactStart> | null;
    if (!parsed || parsed.taskId !== task.id || typeof parsed.startedAt !== "string") return stored;
    const exact = dayjs(parsed.startedAt);
    if (!exact.isValid() || exact.isBefore(stored) || !exact.isBefore(stored.add(1, "minute"))) {
      return stored;
    }
    return exact;
  } catch {
    return stored;
  }
}
