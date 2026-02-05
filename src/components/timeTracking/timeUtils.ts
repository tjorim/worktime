export function timeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid time format "${time}". Expected HH:MM.`);
  }
  const [hoursRaw, minutesRaw] = parts;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time value "${time}". Expected numeric hours and minutes.`);
  }
  if (hours < 0 || minutes < 0 || minutes >= 60) {
    throw new Error(`Invalid time value "${time}". Hours must be >= 0 and minutes 0-59.`);
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
  return (timeToMinutes(stop) - timeToMinutes(start)) / 60;
}

export function overlaps(
  start: string,
  stop: string,
  tasks: { id: string; start: string; stop: string }[],
  skipId?: string,
): boolean {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  return tasks.some((task) => {
    if (skipId && task.id === skipId) {
      return false;
    }
    const taskStart = timeToMinutes(task.start);
    const taskStop = timeToMinutes(task.stop);
    return startMin < taskStop && stopMin > taskStart;
  });
}
