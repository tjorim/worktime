import { useCallback, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import { dayjs } from "@/utils/dateTimeUtils";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import type { GanttTask } from "@/types/gantt";
import { useSettings } from "@/contexts/SettingsContext";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { GanttChart } from "./GanttChart";
import { GanttTaskModal, type GanttTaskFormInput } from "./GanttTaskModal";
import * as m from "@/paraglide/messages.js";

export function GanttView() {
  const { tasks, addTask, updateTask, removeTask } = useGanttTasks();
  const currentYear = dayjs().year();
  const { publicHolidayMap } = usePublicHolidays(currentYear);
  const holidayDates = useMemo(() => [...publicHolidayMap.keys()], [publicHolidayMap]);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { lastUsed, updateLastGanttViewMode } = useSettings();

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
      <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
        <Button size="sm" onClick={handleAddTask}>
          <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
          {m.gantt_task_modal_add()}
        </Button>
      </div>

      <GanttChart
        tasks={tasks}
        initialViewMode={lastUsed.ganttViewMode}
        holidays={holidayDates}
        onTaskClick={handleTaskClick}
        onDateChange={handleDateChange}
        onProgressChange={handleProgressChange}
        onViewModeChange={updateLastGanttViewMode}
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
        title={m.gantt_delete_task_title()}
        message={
          editingTask
            ? m.gantt_delete_task_message({ name: editingTask.name })
            : m.gantt_delete_task_unnamed_message()
        }
        confirmLabel={m.gantt_delete_label()}
        variant="danger"
        icon="bi-trash"
        onConfirm={handleDeleteTask}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
