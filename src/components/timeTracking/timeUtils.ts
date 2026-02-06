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
    return timeToMinutes(start) !== timeToMinutes(stop);
  } catch {
    return false;
  }
}

const MINUTES_PER_DAY = 1440;

export function calculateDurationHours(start: string, stop: string): number {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  if (startMin === stopMin) return 0;
  const diff = stopMin - startMin;
  return (diff > 0 ? diff : diff + MINUTES_PER_DAY) / 60;
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

function segmentsOverlap(
  aStart: number,
  aStop: number,
  bStart: number,
  bStop: number,
): boolean {
  return aStart < bStop && aStop > bStart;
}

function rangeOverlapsSegments(
  aStart: number,
  aStop: number,
  bStart: number,
  bStop: number,
): boolean {
  const aSegs =
    aStop > aStart
      ? [[aStart, aStop]]
      : [
          [aStart, MINUTES_PER_DAY],
          [0, aStop],
        ];
  const bSegs =
    bStop > bStart
      ? [[bStart, bStop]]
      : [
          [bStart, MINUTES_PER_DAY],
          [0, bStop],
        ];

  return aSegs.some(([as, ae]) => bSegs.some(([bs, be]) => segmentsOverlap(as, ae, bs, be)));
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
    return rangeOverlapsSegments(startMin, stopMin, taskStart, taskStop);
  });
}
