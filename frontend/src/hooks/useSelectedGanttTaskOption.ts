import { useMemo } from "react";
import type { GanttTask } from "@/types/gantt";

export type GanttTaskOption = { value: string; label: string };

export function useSelectedGanttTaskOption(
  ganttTasks: GanttTask[],
  ganttTaskId: string | undefined | null,
): GanttTaskOption | null {
  return useMemo(() => {
    if (!ganttTaskId) {
      return null;
    }

    const selected = ganttTasks.find((task) => task.id === ganttTaskId);
    return selected ? { value: selected.id, label: selected.name } : null;
  }, [ganttTasks, ganttTaskId]);
}
