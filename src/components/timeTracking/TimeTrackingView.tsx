import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import { useViewMode } from "../../hooks/useViewMode";
import { TimeTrackerPanel } from "./TimeTrackerPanel";
import { useTimeTrackingStorage } from "../../hooks/useTimeTrackingStorage";
import { WeeklyOverviewPanel } from "./WeeklyOverviewPanel";

const TIME_TRACKING_VIEWS = ["daily", "weekly"] as const;

export function TimeTrackingView() {
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

      <Card className="shadow-sm">
        <Card.Header className="fw-semibold">
          {viewMode === "daily" ? "Daily Time Tracking" : "Weekly Overview"}
        </Card.Header>
        <Card.Body>
          {viewMode === "daily" && (
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
          )}

          {viewMode === "weekly" && <WeeklyOverviewPanel tasks={tasks} />}
        </Card.Body>
      </Card>
    </div>
  );
}
