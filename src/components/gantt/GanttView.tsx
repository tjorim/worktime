import { useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { useGanttTasks } from "../../hooks/useGanttTasks";
import type { GanttTask } from "../../types/gantt";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { GanttChart, type GanttViewMode } from "./GanttChart";
import { GanttTaskModal, type GanttTaskFormInput } from "./GanttTaskModal";

const GANTT_VIEW_MODES: GanttViewMode[] = ["Day", "Week", "Month"];

export function GanttView() {
  const { tasks, addTask, updateTask, removeTask } = useGanttTasks();
  const [viewMode, setViewMode] = useState<GanttViewMode>("Week");
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleAddTask = () => {
    setEditingTask(null);
    setShowModal(true);
  };

  const handleTaskClick = useCallback(
    (taskId: string) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }

      setEditingTask(task);
      setShowModal(true);
    },
    [tasks],
  );

  const handleSaveTask = (payload: GanttTaskFormInput) => {
    if (editingTask) {
      updateTask(editingTask.id, payload);
    } else {
      addTask(payload);
    }

    setShowModal(false);
    setEditingTask(null);
  };

  const handleHideModal = () => {
    setShowModal(false);
    setEditingTask(null);
  };

  const handleDateChange = useCallback(
    (taskId: string, start: string, end: string) => {
      updateTask(taskId, { start, end });
    },
    [updateTask],
  );

  const handleProgressChange = useCallback(
    (taskId: string, progress: number) => {
      updateTask(taskId, { progress });
    },
    [updateTask],
  );

  const handleDeleteTask = () => {
    if (!editingTask) {
      return;
    }

    removeTask(editingTask.id);
    setShowDeleteConfirm(false);
    setShowModal(false);
    setEditingTask(null);
  };

  return (
    <div className="gantt-view py-3 d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <ButtonGroup aria-label="Select Gantt chart scale">
          {GANTT_VIEW_MODES.map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "primary" : "outline-primary"}
              size="sm"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </Button>
          ))}
        </ButtonGroup>

        <Button size="sm" onClick={handleAddTask}>
          <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
          Add Task
        </Button>
      </div>

      <GanttChart
        tasks={tasks}
        viewMode={viewMode}
        onTaskClick={handleTaskClick}
        onDateChange={handleDateChange}
        onProgressChange={handleProgressChange}
      />

      <GanttTaskModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSaveTask}
        task={editingTask ?? undefined}
        existingTasks={tasks}
        onDelete={editingTask ? () => setShowDeleteConfirm(true) : undefined}
      />

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        title="Delete task"
        message={
          editingTask
            ? `Are you sure you want to delete “${editingTask.name}”? This cannot be undone.`
            : "Are you sure you want to delete this task?"
        }
        confirmLabel="Delete"
        variant="danger"
        icon="bi-trash"
        onConfirm={handleDeleteTask}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
