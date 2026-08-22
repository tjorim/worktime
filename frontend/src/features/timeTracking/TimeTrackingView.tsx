import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as m from "@/paraglide/messages.js";
import { useLastUsed } from "@/contexts/LastUsedContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { calculateWeeklyShiftTarget } from "@/utils/shiftCalculations";
import { getEffectiveTeam } from "@/utils/scheduleUtils";
import { TimeTrackingDailyView } from "./TimeTrackingDailyView";
import { TimeTrackingWeeklyView } from "./TimeTrackingWeeklyView";

/**
 * Valid time tracking view modes. Source of truth for all available views.
 */
const TIME_TRACKING_VIEWS = ["daily", "weekly"] as const;

/**
 * Default time tracking view mode when no preference is stored or when stored value is invalid.
 */
const DEFAULT_TIME_TRACKING_VIEW = TIME_TRACKING_VIEWS[0]; // "daily"

interface TimeTrackingViewProps {
  /** ID of a time-tracking entry to jump straight to the edit modal for, e.g. requested from the Gantt tab. */
  pendingTaskEditId?: string | null;
  onClearPendingTaskEdit?: () => void;
}

export function TimeTrackingView({
  pendingTaskEditId,
  onClearPendingTaskEdit,
}: TimeTrackingViewProps = {}) {
  const { myTeam, scheduleType } = useSettings();
  const { lastUsed, updateLastTimeTrackingView } = useLastUsed();
  const toast = useToast();
  const {
    tasks,
    templates,
    labels,
    addTask,
    updateTaskTimes,
    toggleBreak,
    removeTask,
    updateLabels,
  } = useTimeTrackingStorage();

  // Delete immediately, then offer undo. Re-adding restores the same task id
  // via the existing store API, so sync sees a restore rather than a duplicate.
  const handleRemoveTask = useCallback(
    (id: string) => {
      const removedTask = tasks.find((task) => task.id === id);
      removeTask(id);
      if (removedTask) {
        toast.showUndo(m.tt_task_removed(), () => {
          void addTask(removedTask);
        });
      }
    },
    [tasks, removeTask, addTask, toast],
  );
  const [viewMode, setViewMode] = useState(lastUsed.timeTrackingView ?? DEFAULT_TIME_TRACKING_VIEW);
  const [selectedDailyDate, setSelectedDailyDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [selectedWeeklyDate, setSelectedWeeklyDate] = useState(dayjs().format("YYYY-MM-DD"));

  // Skip the initial run: viewMode is already initialized from lastUsed.timeTrackingView,
  // so persisting it back on mount would be a no-op write that still bumps the shared
  // preferences blob's _updatedAt — making local state look newer than it really is
  // and winning last-write-wins reconciliation against genuinely newer server data.
  const isInitialTimeTrackingViewRender = useRef(true);
  useEffect(() => {
    if (isInitialTimeTrackingViewRender.current) {
      isInitialTimeTrackingViewRender.current = false;
      return;
    }
    updateLastTimeTrackingView(viewMode);
  }, [updateLastTimeTrackingView, viewMode]);

  const pendingEditTask = useMemo(
    () =>
      pendingTaskEditId ? (tasks.find((item) => item.id === pendingTaskEditId) ?? null) : null,
    [pendingTaskEditId, tasks],
  );

  useEffect(() => {
    if (!pendingTaskEditId) return;
    if (!pendingEditTask) {
      // Entry no longer exists (e.g. removed) — clear the request so it doesn't get stuck.
      onClearPendingTaskEdit?.();
      return;
    }
    setViewMode("daily");
    setSelectedDailyDate(pendingEditTask.startTime.slice(0, 10));
  }, [pendingTaskEditId, pendingEditTask, onClearPendingTaskEdit]);


  const effectiveTeam = useMemo(
    () => getEffectiveTeam(myTeam, scheduleType),
    [myTeam, scheduleType],
  );
  const weeklyTarget = useMemo(
    () =>
      effectiveTeam != null
        ? calculateWeeklyShiftTarget(selectedWeeklyDate, effectiveTeam, scheduleType)
        : null,
    [selectedWeeklyDate, effectiveTeam, scheduleType],
  );

  return (
    <div className="time-tracking-view py-3 d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <ButtonGroup className="view-toggle-group" aria-label={m.tt_toggle_view_aria()}>
          <Button
            variant={viewMode === "daily" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "daily"}
            onClick={() => setViewMode("daily")}
          >
            <i className="bi bi-list-check me-1" aria-hidden="true"></i>
            {m.tt_daily_log()}
          </Button>
          <Button
            variant={viewMode === "weekly" ? "primary" : "outline-primary"}
            size="sm"
            aria-pressed={viewMode === "weekly"}
            onClick={() => setViewMode("weekly")}
          >
            <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
            {m.tt_weekly_summary()}
          </Button>
        </ButtonGroup>
      </div>

      {viewMode === "daily" && (
        <TimeTrackingDailyView
          tasks={tasks}
          labels={labels}
          templates={templates}
          selectedDate={selectedDailyDate}
          onSelectedDateChange={setSelectedDailyDate}
          onAddTask={addTask}
          onUpdateLabels={updateLabels}
          onUpdateTaskTimes={updateTaskTimes}
          onRemoveTask={handleRemoveTask}
          onToggleBreak={toggleBreak}
          externalEditRequest={pendingEditTask ? { task: pendingEditTask } : null}
          onExternalEditRequestHandled={onClearPendingTaskEdit}
        />
      )}

      {viewMode === "weekly" && (
        <TimeTrackingWeeklyView
          tasks={tasks}
          labels={labels}
          selectedDate={selectedWeeklyDate}
          onSelectedDateChange={setSelectedWeeklyDate}
          weeklyTargetHours={weeklyTarget?.weeklyHours}
          weeklyWorkingDays={weeklyTarget?.workingDays}
          onSwitchToDaily={(date) => {
            setSelectedDailyDate(date);
            setViewMode("daily");
          }}
        />
      )}
    </div>
  );
}
