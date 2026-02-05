import { useState } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { TimeTrackerPanel } from "./TimeTrackerPanel";
import { useTimeTrackingStorage } from "../../hooks/useTimeTrackingStorage";
import { WeeklyOverviewPanel } from "./WeeklyOverviewPanel";

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
  const [activeKey, setActiveKey] = useState("tracker");

  return (
    <div className="d-flex flex-column gap-3">
      <Tabs activeKey={activeKey} onSelect={(key) => setActiveKey(key ?? "tracker")}>
        <Tab
          eventKey="tracker"
          title={
            <>
              <i className="bi bi-list-check me-1" aria-hidden="true"></i>
              Daily Log
            </>
          }
        >
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
        </Tab>
        <Tab
          eventKey="overview"
          title={
            <>
              <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
              Weekly Summary
            </>
          }
        >
          <WeeklyOverviewPanel tasks={tasks} />
        </Tab>
      </Tabs>
    </div>
  );
}
