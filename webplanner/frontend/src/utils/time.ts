export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isValidRange(start: string, stop: string): boolean {
  return timeToMinutes(stop) > timeToMinutes(start);
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
