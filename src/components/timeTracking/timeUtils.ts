export function timeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid time format "${time}". Expected HH:MM.`);
  }
  const [hoursRaw, minutesRaw] = parts.map((segment) => segment.trim());

  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!hoursRaw || !minutesRaw || Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time value "${time}". Expected numeric hours and minutes.`);
  }
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60) {
    throw new Error(`Invalid time value "${time}". Hours must be 0-23 and minutes must be 0-59.`);
  }
  return hours * 60 + minutes;
}

export function isValidRange(start: string, stop: string): boolean {
  try {
    return timeToMinutes(stop) > timeToMinutes(start);
  } catch {
    return false;
  }
}

export function calculateDurationHours(start: string, stop: string): number {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  if (stopMin <= startMin) return 0;
  return (stopMin - startMin) / 60;
}

/**
 * Returns true when the string looks like a valid HH:MM time value.
 */
export function isValidTimeString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    timeToMinutes(value);
    return true;
  } catch {
    return false;
  }
}

function segmentsOverlap(aStart: number, aStop: number, bStart: number, bStop: number): boolean {
  return aStart < bStop && aStop > bStart;
}

export function overlaps(
  start: string,
  stop: string,
  tasks: { id: string; start: string; stop: string }[],
  skipId?: string,
): boolean {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  if (stopMin <= startMin) {
    return false;
  }

  return tasks.some((task) => {
    if (skipId && task.id === skipId) {
      return false;
    }
    try {
      const taskStart = timeToMinutes(task.start);
      const taskStop = timeToMinutes(task.stop);
      if (taskStop <= taskStart) {
        return false;
      }
      return segmentsOverlap(startMin, stopMin, taskStart, taskStop);
    } catch (error) {
      console.warn(`Failed to parse task times for task ${task.id}:`, task, error);
      return false;
    }
  });
}
