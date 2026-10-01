import {
  CalendarClock as CalendarClockIcon,
  ChartGantt as ChartGanttIcon,
  CircleX as CircleXIcon,
  Clock as ClockIcon,
  Coffee as CoffeeIcon,
  History as HistoryIcon,
  Hourglass as HourglassIcon,
  Pencil as PencilIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { Dayjs } from "dayjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { dayjs } from "@/utils/dateTimeUtils";
import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ContextMenu, type ContextMenuItem } from "@/components/shared/ContextMenu";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { buildLabelNameMap, type Label } from "@/lib/timeTracking/constants";
import { LabelChip } from "./LabelChip";
import { TaskEditModal, type TaskEditForm } from "@/components/shared/TaskEditModal";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import type { GanttTask } from "@/types/gantt";
import { BREAK_DURATION_MINUTES, isValidRange, overlaps } from "@/lib/timeTracking/timeUtils";
import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";
import { cn } from "@/lib/utils";

export type EditRequest = {
  task: StoredTimeTrackingTask;
  info?: string;
};

type NowPosition =
  | { type: "separator"; insertBeforeIndex: number }
  | { type: "within"; taskIndex: number }
  | null;

type DailyTaskListProps = {
  tasks: StoredTimeTrackingTask[];
  validationTasks?: StoredTimeTrackingTask[];
  labels: Label[];
  ganttTasks: GanttTask[];
  showGanttPicker: boolean;
  editRequest?: EditRequest | null;
  onEditRequestHandled?: () => void;
  onUpdateTask: (payload: {
    id: string;
    text: string;
    label: string;
    start: string;
    stop?: string | null;
    ganttTaskId: string;
  }) => Promise<boolean> | boolean;
  onRemoveTask: (id: string) => void;
  onToggleBreak: (taskId: string, includesBreak: boolean) => void;
  /** Live current time, used to render the "Now" indicator. */
  liveTime?: Dayjs;
  /** Whether the selected date is today. */
  isToday?: boolean;
};

function NowIndicator({ liveTime }: { liveTime: Dayjs }) {
  return (
    <div
      className="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1"
      role="separator"
      aria-label={`Current time: ${liveTime.format("HH:mm")}`}
      data-testid="now-indicator"
    >
      <div className="tw:grow tw:border-t-2 tw:border-destructive" />
      <Badge variant="destructive" className="tw:shrink-0">
        <Icon icon={ClockIcon} className="tw:mr-1" />
        {liveTime.format("HH:mm")}
      </Badge>
      <div className="tw:grow tw:border-t-2 tw:border-destructive" />
    </div>
  );
}

function GapIndicator({
  durationMinutes,
  untilNext = false,
}: {
  durationMinutes: number;
  untilNext?: boolean;
}) {
  const tooltipId = useId();
  const ariaLabel = untilNext
    ? m.tt_until_next_aria({ minutes: durationMinutes })
    : m.tt_gap_aria({ minutes: durationMinutes });
  const label = untilNext
    ? m.tt_until_next_label({ minutes: durationMinutes })
    : m.tt_gap_label({ minutes: durationMinutes });
  return (
    <div
      className="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1"
      role="separator"
      aria-label={ariaLabel}
      data-testid="gap-indicator"
    >
      <div className="tw:grow tw:border-0 tw:border-t tw:border-dashed tw:border-warning" />
      <Hint placement="top" content={<div id={tooltipId}>{ariaLabel}</div>}>
        <Badge variant="warning" className="tw:shrink-0" tabIndex={0}>
          <Icon icon={HourglassIcon} className="tw:mr-1" />
          {label}
        </Badge>
      </Hint>
      <div className="tw:grow tw:border-0 tw:border-t tw:border-dashed tw:border-warning" />
    </div>
  );
}

function formatPlannedStart(start: Dayjs, liveTime: Dayjs) {
  const diffMinutes = start.diff(liveTime, "minute");
  const time = start.format("HH:mm");
  if (diffMinutes < 0) {
    return m.tt_plan_overrun({ time, minutes: String(Math.abs(diffMinutes)) });
  }
  const totalMinutes = diffMinutes;
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return m.tt_starts_in_days({ time, days: String(days), hours: String(hours) });
  }
  if (hours > 0) {
    return m.tt_starts_in_hours({ time, hours: String(hours), minutes: String(minutes) });
  }
  return m.tt_starts_in_minutes({ time, minutes: String(minutes) });
}

export function DailyTaskList({
  tasks,
  validationTasks = tasks,
  labels,
  ganttTasks,
  showGanttPicker,
  editRequest,
  onEditRequestHandled,
  onUpdateTask,
  onRemoveTask,
  onToggleBreak,
  liveTime,
  isToday,
}: DailyTaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [externalEditingTask, setExternalEditingTask] = useState<StoredTimeTrackingTask | null>(
    null,
  );
  const [editForm, setEditForm] = useState<TaskEditForm>({
    text: "",
    label: "",
    start: "",
    stop: "",
    includesBreak: false,
    ganttTaskId: "",
  });
  const [editError, setEditError] = useState("");
  const [editInfo, setEditInfo] = useState("");

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    taskId: string;
  }>({ isOpen: false, x: 0, y: 0, taskId: "" });

  // Confirmation dialog state for moving break between tasks
  const [moveBreakConfirm, setMoveBreakConfirm] = useState<{
    isOpen: boolean;
    fromTaskId: string;
    toTaskId: string;
    fromTaskName: string;
  }>({ isOpen: false, fromTaskId: "", toTaskId: "", fromTaskName: "" });

  const colorByLabelId = useMemo(
    () =>
      labels.reduce<Record<string, string>>((map, label) => {
        map[label.id] = label.color;
        return map;
      }, {}),
    [labels],
  );
  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);
  const ganttTaskNameById = useMemo(
    () =>
      ganttTasks.reduce<Record<string, string>>((map, task) => {
        map[task.id] = task.name;
        return map;
      }, {}),
    [ganttTasks],
  );

  const editingTask = editingTaskId
    ? (tasks.find((task) => task.id === editingTaskId) ?? externalEditingTask)
    : null;

  const taskWithBreak = useMemo(() => tasks.find((task) => task.includesBreak) ?? null, [tasks]);
  const runningTaskStart = useMemo(() => {
    const runningTask = tasks.find((task) => !task.stopTime);
    return runningTask ? dayjs(runningTask.startTime) : null;
  }, [tasks]);

  // gapAfter[i] is either confirmed untracked time after a stopped task or,
  // for a running task followed by a plan, the remaining time until that plan.
  const gapAfter = useMemo(() => {
    const gaps: ({ minutes: number; untilNext: boolean } | null)[] = tasks.map(() => null);

    for (let i = 0; i < tasks.length - 1; i++) {
      const current = tasks[i];
      const next = tasks[i + 1];
      if (!current || !next) continue;
      const nextStart = dayjs(next.startTime);
      if (current.stopTime) {
        const gap = nextStart.diff(dayjs(current.stopTime), "minute");
        if (gap > 0) gaps[i] = { minutes: gap, untilNext: false };
      } else if (liveTime) {
        const remaining = nextStart.diff(liveTime, "minute");
        if (remaining > 0) gaps[i] = { minutes: remaining, untilNext: true };
      }
    }

    return gaps;
  }, [liveTime, tasks]);

  // Not memoized: the compiler can't prove this stays memoized (it bails out
  // elsewhere in this component), and the per-render cost of scanning a day's
  // tasks is negligible.
  const nowPosition: NowPosition = (() => {
    if (!isToday || !liveTime || tasks.length === 0) return null;

    const nowMinutes = liveTime.hour() * 60 + liveTime.minute();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      // noUncheckedIndexedAccess keeps indexed array access as possibly undefined.
      if (!task) continue;
      const taskStart = dayjs(task.startTime);
      const taskStartMinutes = taskStart.hour() * 60 + taskStart.minute();

      if (nowMinutes < taskStartMinutes) {
        return { type: "separator", insertBeforeIndex: i };
      }

      const stopDayjs = task.stopTime ? dayjs(task.stopTime) : null;
      const taskStopMinutes = stopDayjs ? stopDayjs.hour() * 60 + stopDayjs.minute() : Infinity;

      if (nowMinutes < taskStopMinutes) {
        return { type: "within", taskIndex: i };
      }
    }

    return { type: "separator", insertBeforeIndex: tasks.length };
  })();

  const gapUntilNextTask = useMemo(() => {
    if (nowPosition?.type !== "separator" || nowPosition.insertBeforeIndex !== 0 || !liveTime) {
      return null;
    }
    const firstTask = tasks[0];
    if (!firstTask) return null;
    const minutes = dayjs(firstTask.startTime).diff(liveTime, "minute");
    return minutes > 0 ? minutes : null;
  }, [liveTime, nowPosition, tasks]);

  const closeEditModal = useCallback(() => {
    setEditingTaskId(null);
    setExternalEditingTask(null);
    setEditForm({
      text: "",
      label: "",
      start: "",
      stop: "",
      includesBreak: false,
      ganttTaskId: "",
    });
    setEditError("");
    setEditInfo("");
  }, []);

  const openEditModal = useCallback(
    (task: StoredTimeTrackingTask, info?: string) => {
      const isInDailyList = tasks.some((t) => t.id === task.id);
      setExternalEditingTask(isInDailyList ? null : task);
      setEditingTaskId(task.id);
      setEditForm({
        text: task.text,
        label: task.label,
        start: dayjs(task.startTime).format("HH:mm"),
        stop: task.stopTime ? dayjs(task.stopTime).format("HH:mm") : "",
        includesBreak: task.includesBreak ?? false,
        ganttTaskId: task.ganttTaskId ?? "",
      });
      setEditInfo(info ?? "");
    },
    [tasks],
  );

  useEffect(() => {
    if (editRequest) {
      openEditModal(editRequest.task, editRequest.info);
      onEditRequestHandled?.();
    }
  }, [editRequest, openEditModal, onEditRequestHandled]);

  const editValidationError = useMemo(() => {
    if (!editingTask || !editForm.start) return "";
    if (editForm.stop && !isValidRange(editForm.start, editForm.stop)) {
      return `${m.tt_unable_to_update_task()} ${m.tt_error_stop_after_start()}`;
    }
    const taskDate = dayjs(editingTask.startTime).format("YYYY-MM-DD");
    const tasksForOverlap = validationTasks
      .filter((task) => dayjs(task.startTime).format("YYYY-MM-DD") === taskDate)
      .map((task) => ({
        id: task.id,
        start: dayjs(task.startTime).format("HH:mm"),
        stop: task.stopTime
          ? dayjs(task.stopTime).format("HH:mm")
          : (liveTime ?? dayjs()).format("HH:mm"),
      }));
    const effectiveStop = editForm.stop || (liveTime ?? dayjs()).format("HH:mm");
    if (overlaps(editForm.start, effectiveStop, tasksForOverlap, editingTask.id)) {
      return `${m.tt_unable_to_update_task()} ${m.tt_error_time_overlap()}`;
    }
    return "";
  }, [editForm.start, editForm.stop, editingTask, liveTime, validationTasks]);

  const submitEditModal = async () => {
    if (!editingTask) {
      return;
    }
    setEditError("");
    // Only include stop if the task originally had one OR user entered a stop time
    const payload: {
      id: string;
      text: string;
      label: string;
      start: string;
      stop?: string | null;
      ganttTaskId: string;
    } = {
      id: editingTask.id,
      text: editForm.text,
      label: editForm.label,
      start: editForm.start,
      ganttTaskId: editForm.ganttTaskId ?? "",
    };
    // Include stop if user provided a value (stopped task) or if task was originally stopped
    if (editForm.stop || editingTask.stopTime) {
      payload.stop = editForm.stop || null;
    }
    try {
      const didUpdate = await onUpdateTask(payload);
      if (!didUpdate) {
        setEditError(m.tt_unable_to_update_task());
        return;
      }
      // Handle break toggle if changed — use edited form values directly
      // to avoid stale data from the pre-update tasks array
      const originalBreak = editingTask.includesBreak ?? false;
      if (editForm.includesBreak !== originalBreak) {
        if (editForm.includesBreak) {
          // Enabling break: check if another task already has it
          if (taskWithBreak && taskWithBreak.id !== editingTask.id) {
            setMoveBreakConfirm({
              isOpen: true,
              fromTaskId: taskWithBreak.id,
              toTaskId: editingTask.id,
              fromTaskName: taskWithBreak.text,
            });
            return; // Do not close modal, wait for confirmation
          } else {
            onToggleBreak(editingTask.id, true);
          }
        } else {
          // Disabling break
          onToggleBreak(editingTask.id, false);
        }
      }
      closeEditModal();
    } catch (error) {
      logger.error("Failed to update task:", error);
      setEditError(m.tt_failed_to_update_task());
    }
  };

  const handleContextMenu = useCallback((event: React.MouseEvent, taskId: string) => {
    event.preventDefault();
    setContextMenu({ isOpen: true, x: event.clientX, y: event.clientY, taskId });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleToggleBreak = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // If this task already has break, remove it
      if (task.includesBreak) {
        onToggleBreak(taskId, false);
        return;
      }

      // Check task duration: must be >= break duration
      if (task.stopTime) {
        const startDayjs = dayjs(task.startTime);
        const stopDayjs = dayjs(task.stopTime);
        const durationMinutes = stopDayjs.diff(startDayjs, "minute");
        if (durationMinutes < BREAK_DURATION_MINUTES) {
          return; // Too short, context menu item should be disabled but guard anyway
        }
      }

      // If another task already has break, ask to move it
      if (taskWithBreak && taskWithBreak.id !== taskId) {
        setMoveBreakConfirm({
          isOpen: true,
          fromTaskId: taskWithBreak.id,
          toTaskId: taskId,
          fromTaskName: taskWithBreak.text,
        });
        return;
      }

      onToggleBreak(taskId, true);
    },
    [tasks, taskWithBreak, onToggleBreak],
  );

  const confirmMoveBreak = useCallback(() => {
    onToggleBreak(moveBreakConfirm.fromTaskId, false);
    onToggleBreak(moveBreakConfirm.toTaskId, true);
    setMoveBreakConfirm({ isOpen: false, fromTaskId: "", toTaskId: "", fromTaskName: "" });
    closeEditModal();
  }, [moveBreakConfirm, onToggleBreak, closeEditModal]);

  const cancelMoveBreak = useCallback(() => {
    setMoveBreakConfirm({ isOpen: false, fromTaskId: "", toTaskId: "", fromTaskName: "" });
  }, []);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    const task = tasks.find((t) => t.id === contextMenu.taskId);
    if (!task) return [];

    const isCurrentBreakTask = task.includesBreak;

    // Check if task is long enough for break
    let isTooShort = false;
    if (!isCurrentBreakTask && task.stopTime) {
      const startDayjs = dayjs(task.startTime);
      const stopDayjs = dayjs(task.stopTime);
      isTooShort = stopDayjs.diff(startDayjs, "minute") < BREAK_DURATION_MINUTES;
    }

    // Running tasks (no stopTime) can have break toggled — duration is not yet final
    const isRunning = !task.stopTime;

    const items: ContextMenuItem[] = [];

    if (isCurrentBreakTask) {
      items.push({
        label: m.tt_remove_break(),
        icon: CircleXIcon,
        onClick: () => handleToggleBreak(task.id),
      });
    } else if (isTooShort && !isRunning) {
      items.push({
        label: m.tt_too_short_for_break({ minutes: BREAK_DURATION_MINUTES }),
        icon: CoffeeIcon,
        onClick: () => {},
        disabled: true,
      });
    } else {
      items.push({
        label: m.tt_context_includes_break({ minutes: BREAK_DURATION_MINUTES }),
        icon: CoffeeIcon,
        onClick: () => handleToggleBreak(task.id),
      });
    }

    items.push({
      label: m.edit(),
      icon: PencilIcon,
      onClick: () => openEditModal(task),
    });

    items.push({
      label: m.remove(),
      icon: Trash2Icon,
      onClick: () => onRemoveTask(task.id),
      variant: "danger",
    });

    return items;
  }, [contextMenu.taskId, tasks, handleToggleBreak, openEditModal, onRemoveTask]);

  if (tasks.length === 0 && !editingTask) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title={m.tt_no_entries_title()}
        description={m.tt_no_entries_desc()}
      />
    );
  }

  return (
    <>
      {tasks.length === 0 ? null : (
        <div
          data-slot="task-list"
          className="tw:mt-3 tw:divide-y tw:divide-border tw:rounded-lg tw:border tw:border-border"
        >
          {nowPosition?.type === "separator" && nowPosition.insertBeforeIndex === 0 && liveTime && (
            <>
              <NowIndicator liveTime={liveTime} />
              {gapUntilNextTask !== null && (
                <GapIndicator durationMinutes={gapUntilNextTask} untilNext />
              )}
            </>
          )}
          {tasks.map((task, index) => {
            const startDisplay = dayjs(task.startTime).format("HH:mm");
            const effectiveStopTime = task.stopTime ? dayjs(task.stopTime) : dayjs();
            const stopDisplay = task.stopTime
              ? effectiveStopTime.format("HH:mm")
              : m.tt_running_status();
            const labelColor = colorByLabelId[task.label];
            const isCurrentTask = nowPosition?.type === "within" && nowPosition.taskIndex === index;
            const taskStart = dayjs(task.startTime);
            const isPlanned = Boolean(
              task.stopTime &&
              liveTime &&
              (taskStart.isAfter(liveTime) ||
                (runningTaskStart && taskStart.isAfter(runningTaskStart))),
            );
            const gap = gapAfter[index] ?? null;
            const ganttTaskName = task.ganttTaskId
              ? ganttTaskNameById[task.ganttTaskId]
              : undefined;
            return (
              <Fragment key={task.id}>
                <div
                  data-slot="task-row"
                  onContextMenu={(e) => handleContextMenu(e, task.id)}
                  className={cn(
                    "tw:px-3 tw:py-2",
                    isPlanned && "tw:bg-muted",
                    isCurrentTask && "tw:border-l-3 tw:border-l-destructive",
                    // Dashed edge on a pseudo-element: `border-dashed` on the row would also dash
                    // its divider, and without preflight it needs `border-0` that removes the divider
                    !isCurrentTask &&
                      isPlanned &&
                      "tw:relative tw:before:absolute tw:before:inset-y-0 tw:before:left-0 tw:before:border-0 tw:before:border-l-3 tw:before:border-dashed tw:before:border-l-muted-foreground",
                  )}
                >
                  <div className="tw:flex tw:items-start tw:justify-between tw:gap-2">
                    <div className="tw:grow">
                      <div className="tw:font-semibold">
                        {task.text}{" "}
                        <LabelChip color={labelColor}>
                          {labelNameById[task.label] ?? m.tt_unknown_label()}
                        </LabelChip>
                        {isCurrentTask && (
                          <Badge
                            variant="destructive"
                            className="tw:ml-2"
                            aria-label={m.tt_now_aria()}
                          >
                            <Icon icon={ClockIcon} className="tw:mr-1" />
                            {m.tt_now()}
                          </Badge>
                        )}
                        {isPlanned && (
                          <Badge variant="secondary" className="tw:ml-2">
                            <Icon icon={CalendarClockIcon} className="tw:mr-1" />
                            {m.tt_planned_status()}
                          </Badge>
                        )}
                        {task.includesBreak && (
                          <Hint
                            placement="top"
                            content={
                              <div id={`break-badge-${task.id}`}>
                                {m.tt_break_deducted({ minutes: BREAK_DURATION_MINUTES })}
                              </div>
                            }
                          >
                            <Badge
                              variant="secondary"
                              className="tw:ml-2"
                              aria-label={m.tt_break_deducted({ minutes: BREAK_DURATION_MINUTES })}
                              tabIndex={0}
                            >
                              <Icon icon={CoffeeIcon} className="tw:mr-1" />-
                              {BREAK_DURATION_MINUTES}
                              min
                            </Badge>
                          </Hint>
                        )}
                        {ganttTaskName && (
                          <Hint
                            placement="top"
                            content={
                              <div id={`gantt-badge-${task.id}`}>
                                {m.tt_gantt_task_badge({ name: ganttTaskName })}
                              </div>
                            }
                          >
                            <Badge
                              variant="info"
                              className="tw:ml-2"
                              aria-label={m.tt_gantt_task_badge({ name: ganttTaskName })}
                              tabIndex={0}
                            >
                              <Icon icon={ChartGanttIcon} className="tw:mr-1" />
                              {ganttTaskName}
                            </Badge>
                          </Hint>
                        )}
                      </div>
                      <div className="tw:text-sm tw:text-muted-foreground">
                        {isPlanned && liveTime
                          ? formatPlannedStart(dayjs(task.startTime), liveTime)
                          : `${m.form_start()}: ${startDisplay}`}
                        {` · ${m.form_stop()}: ${stopDisplay}`}
                      </div>
                    </div>
                    <div className="tw:hidden tw:shrink-0 tw:gap-1 tw:md:flex">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={m.edit_with_name({ name: task.text })}
                        onClick={() => openEditModal(task)}
                      >
                        <Icon icon={PencilIcon} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-label={m.delete_with_name({ name: task.text })}
                        onClick={() => onRemoveTask(task.id)}
                      >
                        <Icon icon={Trash2Icon} />
                      </Button>
                    </div>
                  </div>
                </div>
                {gap != null && (
                  <GapIndicator durationMinutes={gap.minutes} untilNext={gap.untilNext} />
                )}
                {nowPosition?.type === "separator" &&
                  nowPosition.insertBeforeIndex === index + 1 &&
                  liveTime && <NowIndicator liveTime={liveTime} />}
              </Fragment>
            );
          })}
        </div>
      )}

      <TaskEditModal
        show={editingTask !== null}
        labels={labels}
        ganttTasks={ganttTasks}
        showGanttPicker={showGanttPicker}
        value={editForm}
        onChange={setEditForm}
        onClose={closeEditModal}
        onSubmit={submitEditModal}
        error={editError || editValidationError}
        canSubmit={!editValidationError}
        info={editInfo}
      />

      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={closeContextMenu}
        items={contextMenuItems}
      />

      <ConfirmationDialog
        isOpen={moveBreakConfirm.isOpen}
        title={m.tt_move_break_title()}
        message={m.tt_move_break_message({ name: moveBreakConfirm.fromTaskName })}
        confirmLabel={m.tt_move_break_btn()}
        variant="primary"
        onConfirm={confirmMoveBreak}
        onCancel={cancelMoveBreak}
      />
    </>
  );
}
