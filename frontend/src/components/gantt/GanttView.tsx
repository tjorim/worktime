import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { dayjs } from "@/utils/dateTimeUtils";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import type { GanttTask } from "@/types/gantt";
import { useSettings } from "@/contexts/SettingsContext";
import { useEventStore } from "@/contexts/EventStoreContext";
import { getGanttTimeOffDates } from "@/utils/ganttTimeOff";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { GanttChart } from "@/components/gantt/GanttChart";
import { GanttTableView } from "@/components/gantt/GanttTableView";
import { GanttTaskModal, type GanttTaskFormInput } from "@/components/gantt/GanttTaskModal";
import * as m from "@/paraglide/messages.js";

export function GanttView() {
  const { tasks, addTask, updateTask, removeTask } = useGanttTasks();
  const currentYear = dayjs().year();
  const { publicHolidayMap } = usePublicHolidays(currentYear);
  const holidayDates = useMemo(() => [...publicHolidayMap.keys()], [publicHolidayMap]);
  const { entries: timeOffEntries } = useEventStore();
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { settings, lastUsed, updateLastGanttView, updateLastGanttViewMode } = useSettings();
  const timeOffDates = useMemo(
    () => (settings.enableTimeOff ? getGanttTimeOffDates(timeOffEntries, currentYear) : []),
    [currentYear, settings.enableTimeOff, timeOffEntries],
  );
  const [view, setView] = useState(lastUsed.ganttView);

  useEffect(() => {
    updateLastGanttView(view);
  }, [updateLastGanttView, view]);

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

  const handleRemoveTask = useCallback(
    (taskId: string) => {
      removeTask(taskId);
    },
    [removeTask],
  );

  const handleDeleteTask = () => {
    if (!editingTask) {
      return;
    }

    handleRemoveTask(editingTask.id);
    setShowDeleteConfirm(false);
    setShowModal(false);
    setEditingTask(null);
  };

  return (
    <div className="gantt-view py-3 d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <ButtonGroup aria-label={m.gantt_toggle_view_aria()}>
          <Button
            variant={view === "chart" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            <i className="bi bi-bar-chart me-1" aria-hidden="true"></i>
            {m.gantt_chart_view()}
          </Button>
          <Button
            variant={view === "table" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <i className="bi bi-table me-1" aria-hidden="true"></i>
            {m.gantt_table_view()}
          </Button>
        </ButtonGroup>
        <Button size="sm" onClick={handleAddTask}>
          <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
          {m.gantt_task_modal_add()}
        </Button>
      </div>

      {view === "chart" ? (
        <GanttChart
          tasks={tasks}
          initialViewMode={lastUsed.ganttViewMode}
          holidays={holidayDates}
          timeOffDates={timeOffDates}
          onTaskClick={handleTaskClick}
          onDateChange={handleDateChange}
          onProgressChange={handleProgressChange}
          onViewModeChange={updateLastGanttViewMode}
        />
      ) : (
        <GanttTableView
          tasks={tasks}
          onTaskClick={handleTaskClick}
          onDeleteTask={handleRemoveTask}
        />
      )}

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
