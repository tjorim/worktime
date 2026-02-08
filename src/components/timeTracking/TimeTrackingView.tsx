import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import { useEffect, useState } from "react";
import { useSettings } from "../../contexts/SettingsContext";
import { dayjs } from "../../utils/dateTimeUtils";
import { useTimeTrackingStorage } from "../../hooks/useTimeTrackingStorage";
import { getWeeklyHours } from "../../utils/scheduleUtils";
import { TimeTrackingConfigView } from "./TimeTrackingConfigView";
import { TimeTrackingDailyView } from "./TimeTrackingDailyView";
import { TimeTrackingWeeklyView } from "./TimeTrackingWeeklyView";

/**
 * Valid time tracking view modes. Source of truth for all available views.
 */
const TIME_TRACKING_VIEWS = ["daily", "weekly", "config"] as const;

/**
 * Default time tracking view mode when no preference is stored or when stored value is invalid.
 */
const DEFAULT_TIME_TRACKING_VIEW = TIME_TRACKING_VIEWS[0]; // "daily"

export function TimeTrackingView() {
  const { scheduleType, lastUsed, updateLastTimeTrackingView } = useSettings();
  const {
    tasks,
    templates,
    labels,
    addTask,
    updateTaskTimes,
    removeTask,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    updateLabels,
    exportData,
    importData,
  } = useTimeTrackingStorage();
  const [viewMode, setViewMode] = useState(lastUsed.timeTrackingView ?? DEFAULT_TIME_TRACKING_VIEW);
  const [selectedDailyDate, setSelectedDailyDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [selectedWeeklyDate, setSelectedWeeklyDate] = useState(dayjs().format("YYYY-MM-DD"));

  useEffect(() => {
    updateLastTimeTrackingView(viewMode);
  }, [updateLastTimeTrackingView, viewMode]);

  const weeklyTargetHours = getWeeklyHours(scheduleType) ?? undefined;

  return (
    <div className="time-tracking-view py-3 d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <ButtonGroup aria-label="Toggle time tracking view">
          <Button
            variant={viewMode === "daily" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => setViewMode("daily")}
          >
            <i className="bi bi-list-check me-1" aria-hidden="true"></i>
            Daily Log
          </Button>
          <Button
            variant={viewMode === "weekly" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => setViewMode("weekly")}
          >
            <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
            Weekly Summary
          </Button>
          <Button
            variant={viewMode === "config" ? "primary" : "outline-primary"}
            size="sm"
            onClick={() => setViewMode("config")}
          >
            <i className="bi bi-gear me-1" aria-hidden="true"></i>
            Config
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
          onUpdateTaskTimes={updateTaskTimes}
          onRemoveTask={removeTask}
        />
      )}

      {viewMode === "weekly" && (
        <TimeTrackingWeeklyView
          tasks={tasks}
          labels={labels}
          selectedDate={selectedWeeklyDate}
          onSelectedDateChange={setSelectedWeeklyDate}
          weeklyTargetHours={weeklyTargetHours}
        />
      )}

      {viewMode === "config" && (
        <Card className="shadow-sm">
          <Card.Header className="fw-semibold">Time Tracking Configuration</Card.Header>
          <Card.Body>
            <TimeTrackingConfigView
              labels={labels}
              templates={templates}
              onAddTemplate={addTemplate}
              onUpdateTemplate={updateTemplate}
              onDeleteTemplate={deleteTemplate}
              onUpdateLabels={updateLabels}
              onExportData={exportData}
              onImportData={importData}
            />
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
