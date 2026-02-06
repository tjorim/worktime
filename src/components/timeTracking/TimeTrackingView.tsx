import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import { useSettings } from "../../contexts/SettingsContext";
import { useViewMode } from "../../hooks/useViewMode";
import { TimeTrackerPanel } from "./TimeTrackerPanel";
import { useTimeTrackingStorage } from "../../hooks/useTimeTrackingStorage";
import { WeeklyOverviewPanel } from "./WeeklyOverviewPanel";

const TIME_TRACKING_VIEWS = ["daily", "weekly"] as const;

export function TimeTrackingView() {
  const { settings } = useSettings();
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
  const [viewMode, setViewMode] = useViewMode(undefined, TIME_TRACKING_VIEWS, "daily");

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
