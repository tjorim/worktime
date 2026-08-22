import { useEffect, useMemo, useRef } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import type { GanttTask } from "@/types/gantt";
import { EmptyState } from "@/components/shared/EmptyState";
import type { GanttViewMode } from "@/contexts/SettingsContext";
import { formatLoggedDuration } from "@/utils/ganttLoggedTime";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";

const POPUP_DATE_FORMAT = "MMM D";
const EMPTY_ARRAY: string[] = [];
const EMPTY_MAP: Map<string, number> = new Map();

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
  timeOffDates?: string[];
  /** Total logged time per task, in minutes. Shown as an extra detail in the hover popup. */
  loggedMinutesByTaskId?: Map<string, number>;
  /** Label id -> color, used to tint each task's bar with its label's color. */
  labelColorById?: Record<string, string>;
  onTaskClick: (taskId: string) => void;
  onDateChange: (taskId: string, start: string, end: string) => void;
  onProgressChange: (taskId: string, progress: number) => void;
  onViewModeChange?: (mode: GanttViewMode) => void;
}

const EMPTY_LABEL_COLOR_MAP: Record<string, string> = {};

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
  holidays = EMPTY_ARRAY,
  timeOffDates = EMPTY_ARRAY,
  loggedMinutesByTaskId = EMPTY_MAP,
  labelColorById = EMPTY_LABEL_COLOR_MAP,
  onTaskClick,
  onDateChange,
  onProgressChange,
  onViewModeChange,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<import("frappe-gantt").Gantt | null>(null);
  const coloredTasks = useMemo(
    () =>
      tasks.map((task) => ({
        ...task,
        color: task.label ? labelColorById[task.label] : undefined,
      })),
    [tasks, labelColorById],
  );
  type ColoredGanttTask = (typeof coloredTasks)[number];
  const tasksRef = useRef(coloredTasks);
  const prevTasksRef = useRef<ColoredGanttTask[]>([]);
  const initialViewModeRef = useRef(initialViewMode);
  const loggedMinutesByTaskIdRef = useRef(loggedMinutesByTaskId);
  const onTaskClickRef = useRef(onTaskClick);
  const onDateChangeRef = useRef(onDateChange);
  const onProgressChangeRef = useRef(onProgressChange);
  const onViewModeChangeRef = useRef(onViewModeChange);

  tasksRef.current = coloredTasks;
  initialViewModeRef.current = initialViewMode;
  loggedMinutesByTaskIdRef.current = loggedMinutesByTaskId;
  onTaskClickRef.current = onTaskClick;
  onDateChangeRef.current = onDateChange;
  onProgressChangeRef.current = onProgressChange;
  onViewModeChangeRef.current = onViewModeChange;

  const hasAnyTasks = tasks.length > 0;
  const holidaysKey = useMemo(
    () => [holidays, timeOffDates].map((dates) => [...dates].sort().join(",")).join("|"),
    [holidays, timeOffDates],
  );

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
      if (timeOffDates.length > 0) {
        holidaysObj["var(--wt-gantt-time-off-bg)"] = timeOffDates;
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
          const taskId = getTaskId(ctx.task);
          const loggedMinutes = taskId ? loggedMinutesByTaskIdRef.current.get(taskId) : undefined;
          const logged =
            loggedMinutes != null && loggedMinutes > 0
              ? m.gantt_logged_total({ duration: formatLoggedDuration(loggedMinutes) })
              : "";
          const details = [dateRange, duration, progress, logged].filter(Boolean).join(" · ");

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
  }, [hasAnyTasks, holidaysKey]); // oxlint-disable-line react-hooks/exhaustive-deps -- date arrays are intentionally omitted; holidaysKey is their stable, content-derived key and is sufficient to trigger re-initialization

  // Effect 2 — refresh on task changes, deps: [coloredTasks]
  useEffect(() => {
    const prev = prevTasksRef.current;
    prevTasksRef.current = coloredTasks;

    if (!ganttRef.current || coloredTasks.length === 0) {
      return;
    }

    // Full refresh if task count changed (add/remove)
    if (coloredTasks.length !== prev.length) {
      ganttRef.current.refresh(coloredTasks);
      return;
    }

    // Build a lookup of previous tasks by id
    const prevById = new Map(prev.map((t) => [t.id, t]));
    const idsReordered = coloredTasks.some((task, index) => {
      const previousTask = prev[index];
      return !previousTask || previousTask.id !== task.id;
    });

    if (idsReordered) {
      ganttRef.current.refresh(coloredTasks);
      return;
    }

    // Find tasks whose start, end, progress, or bar color changed
    const changed = coloredTasks.filter((task) => {
      const p = prevById.get(task.id);
      return (
        !p ||
        task.start !== p.start ||
        task.end !== p.end ||
        task.progress !== p.progress ||
        task.color !== p.color
      );
    });

    // Single-task mutation — use update_task for a lightweight in-place update
    if (changed.length === 1) {
      const task = changed[0]!;
      ganttRef.current.update_task(task.id, {
        start: task.start,
        end: task.end,
        progress: task.progress,
        color: task.color,
      });
      return;
    }

    if (changed.length > 0) {
      ganttRef.current.refresh(coloredTasks);
    }
  }, [coloredTasks]);

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
