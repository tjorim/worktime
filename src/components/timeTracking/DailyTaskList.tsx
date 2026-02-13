import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import { dayjs } from "../../utils/dateTimeUtils";
import { useCallback, useMemo, useState } from "react";
import { EmptyState } from "../shared/EmptyState";
import { ContextMenu, type ContextMenuItem } from "../shared/ContextMenu";
import { ConfirmationDialog } from "../ConfirmationDialog";
import {
  buildLabelNameMap,
  getContrastingTextColor,
  getDefaultLabelColor,
  type TimeTrackingLabel,
} from "./constants";
import type { StoredTimeTrackingTask } from "./types";
import { BREAK_DURATION_MINUTES } from "./timeUtils";

type DailyTaskListProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  onUpdateTask: (payload: {
    id: string;
    text: string;
    label: string;
    start: string;
    stop?: string | null;
  }) => Promise<boolean> | boolean;
  onRemoveTask: (id: string) => void;
  onToggleBreak: (taskId: string, includesBreak: boolean) => void;
};

export function DailyTaskList({
  tasks,
  labels,
  onUpdateTask,
  onRemoveTask,
  onToggleBreak,
}: DailyTaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editStop, setEditStop] = useState("");
  const [editError, setEditError] = useState("");

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
    ? (tasks.find((task) => task.id === editingTaskId) ?? null)
    : null;

  const taskWithBreak = useMemo(
    () => tasks.find((task) => task.includesBreak) ?? null,
    [tasks],
  );

  const closeEditModal = () => {
    setEditingTaskId(null);
    setEditText("");
    setEditLabel("");
    setEditStart("");
    setEditStop("");
    setEditError("");
  };

  const openEditModal = useCallback((task: StoredTimeTrackingTask) => {
    setEditingTaskId(task.id);
    setEditText(task.text);
    setEditLabel(task.label);
    setEditStart(dayjs(task.startTime).format("HH:mm"));
    setEditStop(task.stopTime ? dayjs(task.stopTime).format("HH:mm") : "");
  }, []);

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
    } = {
      id: editingTask.id,
      text: editText,
      label: editLabel,
      start: editStart,
    };
    // Include stop if user provided a value (stopped task) or if task was originally stopped
    if (editStop || editingTask.stopTime) {
      payload.stop = editStop || null;
    }
    try {
      const didUpdate = await onUpdateTask(payload);
      if (!didUpdate) {
        setEditError("Unable to update task. Please review the changes and try again.");
        return;
      }
      closeEditModal();
    } catch (error) {
      console.error("Failed to update task:", error);
      setEditError("Failed to update task. Please try again.");
    }
  };

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, taskId: string) => {
      event.preventDefault();
      setContextMenu({ isOpen: true, x: event.clientX, y: event.clientY, taskId });
    },
    [],
  );

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
  }, [moveBreakConfirm, onToggleBreak]);

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
        label: "Remove break deduction",
        icon: "bi-x-circle",
        onClick: () => handleToggleBreak(task.id),
      });
    } else if (isTooShort && !isRunning) {
      items.push({
        label: `Too short for ${BREAK_DURATION_MINUTES}min break`,
        icon: "bi-cup-hot",
        onClick: () => {},
      });
    } else {
      items.push({
        label: `Includes ${BREAK_DURATION_MINUTES}min break`,
        icon: "bi-cup-hot",
        onClick: () => handleToggleBreak(task.id),
      });
    }

    items.push({
      label: "Edit",
      icon: "bi-pencil",
      onClick: () => openEditModal(task),
    });

    items.push({
      label: "Remove",
      icon: "bi-trash",
      onClick: () => onRemoveTask(task.id),
      variant: "danger",
    });

    return items;
  }, [contextMenu.taskId, tasks, handleToggleBreak, openEditModal, onRemoveTask]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="bi-clock-history"
        title="No Time Entries Yet"
        description="Use the form above to start tracking time or add a completed task."
      />
    );
  }

  return (
    <>
      <ListGroup className="mt-3">
        {tasks.map((task) => {
          const startDisplay = dayjs(task.startTime).format("HH:mm");
          const effectiveStopTime = task.stopTime ? dayjs(task.stopTime) : dayjs();
          const stopDisplay = task.stopTime ? effectiveStopTime.format("HH:mm") : "Running";
          const labelBackground = colorByLabelId[task.label] ?? getDefaultLabelColor();
          const labelTextColor = getContrastingTextColor(labelBackground);
          return (
            <ListGroup.Item
              key={task.id}
              onContextMenu={(e) => handleContextMenu(e, task.id)}
            >
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div className="fw-semibold">
                  {task.text}{" "}
                  <span
                    className="time-tracking-label"
                    style={{
                      backgroundColor: labelBackground,
                      color: labelTextColor,
                    }}
                  >
                    {labelNameById[task.label] ?? "Unknown label"}
                  </span>
                  {task.includesBreak && (
                    <Badge
                      bg="secondary"
                      className="ms-2"
                      title={`${BREAK_DURATION_MINUTES}min break deducted`}
                    >
                      <i className="bi bi-cup-hot me-1" aria-hidden="true"></i>
                      -{BREAK_DURATION_MINUTES}min
                    </Badge>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <Button size="sm" variant="outline-primary" onClick={() => openEditModal(task)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline-danger" onClick={() => onRemoveTask(task.id)}>
                    Remove
                  </Button>
                </div>
              </div>
              <div className="small text-muted mb-2">
                Start: {startDisplay} · Stop: {stopDisplay}
              </div>
            </ListGroup.Item>
          );
        })}
      </ListGroup>

      <Modal show={editingTask !== null} onHide={closeEditModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit Task</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editError && (
            <Alert variant="danger" aria-live="polite">
              {editError}
            </Alert>
          )}
          <Form>
            <Form.Group controlId="editTaskName" className="mb-3">
              <Form.Label>Task</Form.Label>
              <Form.Control
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
              />
            </Form.Group>
            <Form.Group controlId="editTaskLabel" className="mb-3">
              <Form.Label>Label</Form.Label>
              <Form.Select value={editLabel} onChange={(event) => setEditLabel(event.target.value)}>
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <div className="d-flex gap-3">
              <Form.Group controlId="editTaskStart" className="flex-fill">
                <Form.Label>Start</Form.Label>
                <Form.Control
                  type="time"
                  value={editStart}
                  onChange={(event) => setEditStart(event.target.value)}
                />
              </Form.Group>
              <Form.Group controlId="editTaskStop" className="flex-fill">
                <Form.Label>Stop</Form.Label>
                <Form.Control
                  type="time"
                  value={editStop}
                  onChange={(event) => setEditStop(event.target.value)}
                />
                <Form.Text className="text-muted">Leave empty to keep task running</Form.Text>
              </Form.Group>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeEditModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submitEditModal}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>

      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={closeContextMenu}
        items={contextMenuItems}
      />

      <ConfirmationDialog
        isOpen={moveBreakConfirm.isOpen}
        title="Move Break Deduction"
        message={`The break deduction is currently on "${moveBreakConfirm.fromTaskName}". Move it to this task instead?`}
        confirmLabel="Move Break"
        variant="primary"
        onConfirm={confirmMoveBreak}
        onCancel={cancelMoveBreak}
      />
    </>
  );
}
