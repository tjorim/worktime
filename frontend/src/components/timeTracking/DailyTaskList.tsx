import type { Dayjs } from "dayjs";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { dayjs } from "@/utils/dateTimeUtils";
import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ContextMenu, type ContextMenuItem } from "@/components/shared/ContextMenu";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  buildLabelNameMap,
  getContrastingTextColor,
  getDefaultLabelColor,
  type TimeTrackingLabel,
} from "./constants";
import { TaskEditModal, type TaskEditForm } from "./TaskEditModal";
import type { StoredTimeTrackingTask } from "./types";
import type { GanttTask } from "@/types/gantt";
import { BREAK_DURATION_MINUTES } from "./timeUtils";
import * as m from "@/paraglide/messages.js";

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
  labels: TimeTrackingLabel[];
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
      className="d-flex align-items-center gap-2 px-3 py-1"
      role="separator"
      aria-label={`Current time: ${liveTime.format("HH:mm")}`}
      data-testid="now-indicator"
    >
      <div className="flex-grow-1" style={{ borderTop: "2px solid var(--bs-danger)" }} />
      <Badge bg="danger" pill className="flex-shrink-0" style={{ fontSize: "0.75rem" }}>
        <i className="bi bi-clock me-1" aria-hidden="true" />
        {liveTime.format("HH:mm")}
      </Badge>
      <div className="flex-grow-1" style={{ borderTop: "2px solid var(--bs-danger)" }} />
    </div>
  );
}

function GapIndicator({ durationMinutes }: { durationMinutes: number }) {
  const tooltipId = useId();
  return (
    <div
      className="d-flex align-items-center gap-2 px-3 py-1"
      role="separator"
      aria-label={m.tt_gap_aria({ minutes: durationMinutes })}
      data-testid="gap-indicator"
    >
      <div
        className="flex-grow-1"
        style={{ borderTop: "1px dashed var(--bs-warning-border-subtle, #ffc107)" }}
      />
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip id={tooltipId}>{m.tt_gap_aria({ minutes: durationMinutes })}</Tooltip>}
      >
        <Badge bg="warning" text="dark" pill className="flex-shrink-0" style={{ fontSize: "0.75rem" }} tabIndex={0}>
          <i className="bi bi-hourglass-split me-1" aria-hidden="true" />
          {m.tt_gap_label({ minutes: durationMinutes })}
        </Badge>
      </OverlayTrigger>
      <div
        className="flex-grow-1"
        style={{ borderTop: "1px dashed var(--bs-warning-border-subtle, #ffc107)" }}
      />
    </div>
  );
}

export function DailyTaskList({
  tasks,
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

  const editingTask = editingTaskId
    ? (tasks.find((task) => task.id === editingTaskId) ?? externalEditingTask)
    : null;

  const taskWithBreak = useMemo(() => tasks.find((task) => task.includesBreak) ?? null, [tasks]);

  // gapAfter[i] = gap in minutes between tasks[i].stopTime and tasks[i+1].startTime (if >= threshold)
  const gapAfter = useMemo(() => {
    const gaps: (number | null)[] = tasks.map(() => null);

    for (let i = 0; i < tasks.length - 1; i++) {
      const current = tasks[i];
      const next = tasks[i + 1];
      if (!current?.stopTime || !next) continue;
      const gap = dayjs(next.startTime).diff(dayjs(current.stopTime), "minute");
      if (gap > 0) gaps[i] = gap;
    }

    return gaps;
  }, [tasks]);

  const nowPosition = useMemo<NowPosition>(() => {
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
  }, [isToday, liveTime, tasks]);

  const closeEditModal = useCallback(() => {
    setEditingTaskId(null);
    setExternalEditingTask(null);
    setEditForm({ text: "", label: "", start: "", stop: "", includesBreak: false, ganttTaskId: "" });
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
      console.error("Failed to update task:", error);
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
        icon: "bi-x-circle",
        onClick: () => handleToggleBreak(task.id),
      });
    } else if (isTooShort && !isRunning) {
      items.push({
        label: m.tt_too_short_for_break({ minutes: BREAK_DURATION_MINUTES }),
        icon: "bi-cup-hot",
        onClick: () => {},
        disabled: true,
      });
    } else {
      items.push({
        label: m.tt_context_includes_break({ minutes: BREAK_DURATION_MINUTES }),
        icon: "bi-cup-hot",
        onClick: () => handleToggleBreak(task.id),
      });
    }

    items.push({
      label: m.edit(),
      icon: "bi-pencil",
      onClick: () => openEditModal(task),
    });

    items.push({
      label: m.remove(),
      icon: "bi-trash",
      onClick: () => onRemoveTask(task.id),
      variant: "danger",
    });

    return items;
  }, [contextMenu.taskId, tasks, handleToggleBreak, openEditModal, onRemoveTask]);

  if (tasks.length === 0 && !editingTask) {
    return (
      <EmptyState
        icon="bi-clock-history"
        title={m.tt_no_entries_title()}
        description={m.tt_no_entries_desc()}
      />
    );
  }

  return (
    <>
      {tasks.length === 0 ? null : (
        <ListGroup className="mt-3">
          {nowPosition?.type === "separator" && nowPosition.insertBeforeIndex === 0 && liveTime && (
            <NowIndicator liveTime={liveTime} />
          )}
          {tasks.map((task, index) => {
            const startDisplay = dayjs(task.startTime).format("HH:mm");
            const effectiveStopTime = task.stopTime ? dayjs(task.stopTime) : dayjs();
            const stopDisplay = task.stopTime
              ? effectiveStopTime.format("HH:mm")
              : m.tt_running_status();
            const labelBackground = colorByLabelId[task.label] ?? getDefaultLabelColor();
            const labelTextColor = getContrastingTextColor(labelBackground);
            const isCurrentTask = nowPosition?.type === "within" && nowPosition.taskIndex === index;
            const gap = gapAfter[index] ?? null;
            return (
              <Fragment key={task.id}>
                <ListGroup.Item
                  onContextMenu={(e) => handleContextMenu(e, task.id)}
                  style={isCurrentTask ? { borderLeft: "3px solid var(--bs-danger)" } : undefined}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">
                        {task.text}{" "}
                        <span
                          className="time-tracking-label"
                          style={{
                            backgroundColor: labelBackground,
                            color: labelTextColor,
                          }}
                        >
                          {labelNameById[task.label] ?? m.tt_unknown_label()}
                        </span>
                        {isCurrentTask && (
                          <Badge bg="danger" className="ms-2" aria-label={m.tt_now_aria()}>
                            <i className="bi bi-clock me-1" aria-hidden="true" />
                            {m.tt_now()}
                          </Badge>
                        )}
                        {task.includesBreak && (
                          <OverlayTrigger
                            placement="top"
                            overlay={
                              <Tooltip id={`break-badge-${task.id}`}>
                                {m.tt_break_deducted({ minutes: BREAK_DURATION_MINUTES })}
                              </Tooltip>
                            }
                          >
                            <Badge
                              bg="secondary"
                              className="ms-2"
                              aria-label={m.tt_break_deducted({ minutes: BREAK_DURATION_MINUTES })}
                              tabIndex={0}
                            >
                              <i className="bi bi-cup-hot me-1" aria-hidden="true"></i>-
                              {BREAK_DURATION_MINUTES}min
                            </Badge>
                          </OverlayTrigger>
                        )}
                      </div>
                      <div className="small text-muted">
                        {m.form_start()}: {startDisplay} · {m.form_stop()}: {stopDisplay}
                      </div>
                    </div>
                    <div className="d-none d-md-flex gap-1 flex-shrink-0">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        aria-label={m.edit_with_name({ name: task.text })}
                        onClick={() => openEditModal(task)}
                      >
                        <i className="bi bi-pencil" aria-hidden="true"></i>
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        aria-label={m.delete_with_name({ name: task.text })}
                        onClick={() => onRemoveTask(task.id)}
                      >
                        <i className="bi bi-trash" aria-hidden="true"></i>
                      </Button>
                    </div>
                  </div>
                </ListGroup.Item>
                {gap != null && <GapIndicator durationMinutes={gap} />}
                {nowPosition?.type === "separator" &&
                  nowPosition.insertBeforeIndex === index + 1 &&
                  liveTime && <NowIndicator liveTime={liveTime} />}
              </Fragment>
            );
          })}
        </ListGroup>
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
        error={editError}
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
