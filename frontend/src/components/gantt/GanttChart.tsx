import { useEffect, useMemo, useRef } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import type { GanttTask } from "@/types/gantt";
import { EmptyState } from "@/components/shared/EmptyState";
import type { GanttViewMode } from "@/contexts/SettingsContext";
import { getLocale } from "@/paraglide/runtime.js";

const POPUP_DATE_FORMAT = "MMM D";

const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char);
}

interface GanttChartProps {
  tasks: GanttTask[];
  initialViewMode?: GanttViewMode;
  holidays?: string[];
  onTaskClick: (taskId: string) => void;
  onDateChange: (taskId: string, start: string, end: string) => void;
  onProgressChange: (taskId: string, progress: number) => void;
  onViewModeChange?: (mode: GanttViewMode) => void;
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
  initialViewMode = "Day",
  holidays = [],
  onTaskClick,
  onDateChange,
  onProgressChange,
  onViewModeChange,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<import("frappe-gantt").Gantt | null>(null);
  const tasksRef = useRef(tasks);
  const prevTasksRef = useRef<GanttTask[]>([]);
  const initialViewModeRef = useRef(initialViewMode);
  const onTaskClickRef = useRef(onTaskClick);
  const onDateChangeRef = useRef(onDateChange);
  const onProgressChangeRef = useRef(onProgressChange);
  const onViewModeChangeRef = useRef(onViewModeChange);

  tasksRef.current = tasks;
  initialViewModeRef.current = initialViewMode;
  onTaskClickRef.current = onTaskClick;
  onDateChangeRef.current = onDateChange;
  onProgressChangeRef.current = onProgressChange;
  onViewModeChangeRef.current = onViewModeChange;

  const hasAnyTasks = tasks.length > 0;
  const holidaysKey = useMemo(() => [...holidays].sort().join(","), [holidays]);

  // Effect 1 — lifecycle only (init/teardown), deps: [hasAnyTasks, holidaysKey]
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

      const currentHolidays = holidays;
      const holidaysObj: Record<string, string | string[]> = {
        "var(--bs-secondary-bg)": "weekend",
      };
      if (currentHolidays.length > 0) {
        holidaysObj["var(--bs-warning-bg-subtle)"] = currentHolidays;
      }

      ganttRef.current = new Gantt(container, tasksRef.current, {
        view_mode: initialViewModeRef.current,
        view_mode_select: true,
        today_button: true,
        ignore: "weekend",
        holidays: holidaysObj,
        language: getLocale(),
        popup_on: "hover",
        popup: (ctx) => {
          ctx.set_title(escapeHtml(ctx.task.name));
          ctx.set_subtitle(escapeHtml(ctx.task.notes ?? ""));
          const start = ctx.task._start ? dayjs(ctx.task._start).format(POPUP_DATE_FORMAT) : "";
          const end = ctx.task._end ? dayjs(ctx.task._end).format(POPUP_DATE_FORMAT) : "";
          const dateRange = start && end ? `${start} – ${end}` : start || end;
          const duration =
            ctx.task.actual_duration != null
              ? `${ctx.task.actual_duration} day${ctx.task.actual_duration === 1 ? "" : "s"}`
              : "";
          const progress =
            typeof ctx.task.progress === "number" ? `${Math.floor(ctx.task.progress)}%` : "";
          const details = [dateRange, duration, progress].filter(Boolean).join(" · ");

          ctx.set_details(details);
        },
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
        on_view_change: (mode) => {
          onViewModeChangeRef.current?.(mode as GanttViewMode);
        },
      });
    };

    void initGantt();

    return () => {
      didCancel = true;
      container.innerHTML = "";
      ganttRef.current = null;
    };
  }, [hasAnyTasks, holidaysKey]); // oxlint-disable-line react-hooks/exhaustive-deps -- holidays is intentionally omitted; holidaysKey is its stable, content-derived key and is sufficient to trigger re-initialization

  // Effect 2 — refresh on task changes, deps: [tasks]
  useEffect(() => {
    const prev = prevTasksRef.current;
    prevTasksRef.current = tasks;

    if (!ganttRef.current || tasks.length === 0) {
      return;
    }

    // Full refresh if task count changed (add/remove)
    if (tasks.length !== prev.length) {
      ganttRef.current.refresh(tasks);
      return;
    }

    // Build a lookup of previous tasks by id
    const prevById = new Map(prev.map((t) => [t.id, t]));
    const idsReordered = tasks.some((task, index) => {
      const previousTask = prev[index];
      return !previousTask || previousTask.id !== task.id;
    });

    if (idsReordered) {
      ganttRef.current.refresh(tasks);
      return;
    }

    // Find tasks whose start, end, or progress changed
    const changed = tasks.filter((task) => {
      const p = prevById.get(task.id);
      return !p || task.start !== p.start || task.end !== p.end || task.progress !== p.progress;
    });

    // Single-task mutation — use update_task for a lightweight in-place update
    if (changed.length === 1) {
      const task = changed[0]!;
      ganttRef.current.update_task(task.id, {
        start: task.start,
        end: task.end,
        progress: task.progress,
      });
      return;
    }

    if (changed.length > 0) {
      ganttRef.current.refresh(tasks);
    }
  }, [tasks]);

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
