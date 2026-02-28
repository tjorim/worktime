import { useEffect, useRef } from "react";
import { dayjs } from "../../utils/dateTimeUtils";
import type { GanttTask } from "../../types/gantt";
import { EmptyState } from "../shared/EmptyState";

type GanttViewMode = "Day" | "Week" | "Month";

interface GanttChartProps {
  tasks: GanttTask[];
  viewMode: GanttViewMode;
  onTaskClick: (taskId: string) => void;
  onDateChange: (taskId: string, start: string, end: string) => void;
  onProgressChange: (taskId: string, progress: number) => void;
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
  const initJustRanRef = useRef(false);
  const viewModeRef = useRef(viewMode);
  const onTaskClickRef = useRef(onTaskClick);
  const onDateChangeRef = useRef(onDateChange);
  const onProgressChangeRef = useRef(onProgressChange);

  viewModeRef.current = viewMode;
  onTaskClickRef.current = onTaskClick;
  onDateChangeRef.current = onDateChange;
  onProgressChangeRef.current = onProgressChange;

  useEffect(() => {
    if (tasks.length === 0) {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      ganttRef.current = null;
      initJustRanRef.current = false;
      return;
    }

    if (ganttRef.current || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    let didCancel = false;

    const initGantt = async () => {
      // In the Vite build we load the Gantt JS via ESM import, so no standalone
      // <script src="frappe-gantt.umd.js"> tag is needed.
      const { default: Gantt } = await import("frappe-gantt");
      if (didCancel) {
        return;
      }

      ganttRef.current = new Gantt(container, tasks, {
        view_mode: viewModeRef.current,
        on_click: (task) => onTaskClickRef.current(task.id),
        on_date_change: (task, start, end) => {
          onDateChangeRef.current(
            task.id,
            dayjs(start).format("YYYY-MM-DD"),
            dayjs(end).format("YYYY-MM-DD"),
          );
        },
        on_progress_change: (task, progress) => {
          onProgressChangeRef.current(task.id, progress);
        },
      });
      initJustRanRef.current = true;
    };

    void initGantt();

    return () => {
      didCancel = true;
      container.innerHTML = "";
      ganttRef.current = null;
      initJustRanRef.current = false;
    };
  }, [tasks]);

  useEffect(() => {
    if (!ganttRef.current || tasks.length === 0) {
      return;
    }

    if (initJustRanRef.current) {
      initJustRanRef.current = false;
      return;
    }

    ganttRef.current.refresh(tasks);
  }, [tasks]);

  useEffect(() => {
    if (!ganttRef.current) {
      return;
    }

    ganttRef.current.change_view_mode(viewMode);
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
    <div className="border rounded bg-body overflow-auto" data-testid="gantt-scroll-container">
      <div ref={containerRef} />
    </div>
  );
}

export type { GanttViewMode };
