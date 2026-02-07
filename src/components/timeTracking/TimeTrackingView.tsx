import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import { useEffect, useState } from "react";
import { useSettings } from "../../contexts/SettingsContext";
import { TimeTrackerPanel } from "./TimeTrackerPanel";
import { useTimeTrackingStorage } from "../../hooks/useTimeTrackingStorage";
import { WeeklyOverviewPanel } from "./WeeklyOverviewPanel";

/**
 * Valid time tracking view modes. Source of truth for all available views.
 */
const TIME_TRACKING_VIEWS = ["daily", "weekly"] as const;

/**
 * Default time tracking view mode when no preference is stored or when stored value is invalid.
 */
const DEFAULT_TIME_TRACKING_VIEW = TIME_TRACKING_VIEWS[0]; // "daily"

export function TimeTrackingView() {
  const {
    settings,
    lastUsed,
    updateLastTimeTrackingView,
    updateTimeTrackingWeeklyTargetHours,
  } = useSettings();
  const {
    tasks,
    templates,
    addTask,
    updateTaskTimes,
    removeTask,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    exportData,
    importData,
  } = useTimeTrackingStorage();
  const [viewMode, setViewMode] = useState(lastUsed.timeTrackingView ?? DEFAULT_TIME_TRACKING_VIEW);

  useEffect(() => {
    updateLastTimeTrackingView(viewMode);
  }, [updateLastTimeTrackingView, viewMode]);

  const handleWeeklyTargetHoursChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) {
      return;
    }
    const clampedValue = Math.min(168, Math.max(0, value));
    updateTimeTrackingWeeklyTargetHours(clampedValue);
  };

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
        </ButtonGroup>
      </div>

      <Card className="shadow-sm">
        <Card.Header className="fw-semibold">Time Tracking Settings</Card.Header>
        <Card.Body>
          <Form.Group controlId="weeklyTargetHours">
            <Form.Label>Weekly target hours</Form.Label>
            <Form.Control
              type="number"
              min={0}
              max={168}
              step={0.5}
              value={settings.timeTrackingWeeklyTargetHours}
              onChange={handleWeeklyTargetHoursChange}
              required
              aria-required="true"
              aria-describedby="weeklyTargetHoursHelp"
            />
            <Form.Text className="text-muted" id="weeklyTargetHoursHelp">
              Used for weekly summaries and progress tracking.
            </Form.Text>
          </Form.Group>
        </Card.Body>
      </Card>

      {viewMode === "daily" && (
        <Card className="shadow-sm">
          <Card.Header className="fw-semibold">Daily Time Tracking</Card.Header>
          <Card.Body>
            <TimeTrackerPanel
              tasks={tasks}
              templates={templates}
              onAddTask={addTask}
              onUpdateTaskTimes={updateTaskTimes}
              onRemoveTask={removeTask}
              onAddTemplate={addTemplate}
              onUpdateTemplate={updateTemplate}
              onDeleteTemplate={deleteTemplate}
              onExportData={exportData}
              onImportData={importData}
            />
          </Card.Body>
        </Card>
      )}

      {viewMode === "weekly" && (
        <Card className="shadow-sm">
          <Card.Header className="fw-semibold">Weekly Overview</Card.Header>
          <Card.Body>
            <WeeklyOverviewPanel
              tasks={tasks}
              weeklyTargetHours={settings.timeTrackingWeeklyTargetHours}
            />
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
