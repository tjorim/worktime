import { useEffect, useRef } from "react";
import { dayjs } from "../../utils/dateTimeUtils";
import type { GanttTask } from "../../types/gantt";
import { EmptyState } from "../shared/EmptyState";

type GanttViewMode = "Day" | "Week" | "Month" | "Year";

interface GanttChartProps {
  tasks: GanttTask[];
  viewMode: GanttViewMode;
  onTaskClick: (taskId: string) => void;
  onDateChange: (taskId: string, start: string, end: string) => void;
  onProgressChange: (taskId: string, progress: number) => void;
}

function getTaskId(task: unknown): string | null {
  if (typeof task !== "object" || task === null) {
    return null;
  }

  const id = (task as { id?: unknown }).id;
  if (typeof id !== "string") {
    return null;
  }

  const trimmedId = id.trim();
  return trimmedId ? trimmedId : null;
}

export function GanttChart({
  tasks,
  viewMode,
  onTaskClick,
  onDateChange,
  onProgressChange,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<import("frappe-gantt").Gantt | null>(null);
  const tasksRef = useRef(tasks);
  const viewModeRef = useRef(viewMode);
  const onTaskClickRef = useRef(onTaskClick);
  const onDateChangeRef = useRef(onDateChange);
  const onProgressChangeRef = useRef(onProgressChange);

  tasksRef.current = tasks;
  viewModeRef.current = viewMode;
  onTaskClickRef.current = onTaskClick;
  onDateChangeRef.current = onDateChange;
  onProgressChangeRef.current = onProgressChange;

  const hasAnyTasks = tasks.length > 0;

  // Effect 1 — lifecycle only (init/teardown), deps: [hasAnyTasks]
  useEffect(() => {
    if (!hasAnyTasks) {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      ganttRef.current = null;
      return;
    }

    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    let didCancel = false;

    const initGantt = async () => {
      const { default: Gantt } = await import("frappe-gantt");
      if (didCancel) {
        return;
      }

      ganttRef.current = new Gantt(container, tasksRef.current, {
        view_mode: viewModeRef.current,
        on_click: (task) => {
          const taskId = getTaskId(task);
          if (!taskId) {
            return;
          }

          onTaskClickRef.current(taskId);
        },
        on_date_change: (task, start, end) => {
          const taskId = getTaskId(task);
          if (!taskId) {
            return;
          }

          onDateChangeRef.current(
            taskId,
            dayjs(start).format("YYYY-MM-DD"),
            dayjs(end).format("YYYY-MM-DD"),
          );
        },
        on_progress_change: (task, progress) => {
          const taskId = getTaskId(task);
          if (!taskId) {
            return;
          }

          onProgressChangeRef.current(taskId, progress);
        },
      });
    };

    void initGantt();

    return () => {
      didCancel = true;
      container.innerHTML = "";
      ganttRef.current = null;
    };
  }, [hasAnyTasks]);

  // Effect 2 — refresh on task changes, deps: [tasks]
  useEffect(() => {
    if (!ganttRef.current || tasks.length === 0) {
      return;
    }

    ganttRef.current.refresh(tasks);
  }, [tasks]);

  // Effect 3 — view mode changes
  useEffect(() => {
    if (!ganttRef.current) {
      return;
    }

    ganttRef.current.change_view_mode(viewMode, true);
  }, [viewMode]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="bi-diagram-3"
        title="No tasks yet"
        description="Add your first task to start building your personal timeline."
      />
    );
  }

  return (
    <div
      className="gantt-scroll-container border rounded bg-body overflow-x-auto overflow-y-hidden"
      data-testid="gantt-scroll-container"
    >
      <div ref={containerRef} />
    </div>
  );
}

export type { GanttViewMode };
