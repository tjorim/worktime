import { useCallback, useState } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { TIME_TRACKING_STORAGE_KEYS } from "./constants";
import { TimeTrackerPanel } from "./TimeTrackerPanel";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import { WeeklyOverviewPanel } from "./WeeklyOverviewPanel";

type ImportPayload = {
  tasks?: StoredTimeTrackingTask[];
  templates?: TimeTrackingTemplate[];
};

export function TimeTrackingView() {
  const [tasks, setTasks] = useLocalStorage<StoredTimeTrackingTask[]>(
    TIME_TRACKING_STORAGE_KEYS.tasks,
    [],
  );
  const [templates, setTemplates] = useLocalStorage<TimeTrackingTemplate[]>(
    TIME_TRACKING_STORAGE_KEYS.templates,
    [],
  );
  const [activeKey, setActiveKey] = useState("tracker");

  const addTask = useCallback(
    (payload: StoredTimeTrackingTask) => {
      setTasks((prev) => [...prev, payload]);
    },
    [setTasks],
  );

  const updateTaskTimes = useCallback(
    (payload: { date: string; id: string; newStart: string; newStop: string }) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === payload.id && task.date === payload.date
            ? { ...task, start: payload.newStart, stop: payload.newStop }
            : task,
        ),
      );
    },
    [setTasks],
  );

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== id));
    },
    [setTasks],
  );

  const addTemplate = useCallback(
    (payload: Omit<TimeTrackingTemplate, "id">) => {
      setTemplates((prev) => {
        const maxId = prev.reduce((max, template) => Math.max(max, template.id), 0);
        return [...prev, { id: maxId + 1, ...payload }];
      });
    },
    [setTemplates],
  );

  const updateTemplate = useCallback(
    (payload: { id: number; template: Omit<TimeTrackingTemplate, "id"> }) => {
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === payload.id ? { id: payload.id, ...payload.template } : template,
        ),
      );
    },
    [setTemplates],
  );

  const deleteTemplate = useCallback(
    (id: number) => {
      setTemplates((prev) => prev.filter((template) => template.id !== id));
    },
    [setTemplates],
  );

  const handleExportData = useCallback(
    (date: string) => {
      const payload = {
        tasks,
        templates,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `worktime-time-tracking-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [tasks, templates],
  );

  const handleImportData = useCallback(
    (payload: ImportPayload) => {
      if (payload.tasks) {
        setTasks(payload.tasks);
      }
      if (payload.templates) {
        setTemplates(payload.templates);
      }
    },
    [setTasks, setTemplates],
  );

  return (
    <div className="d-flex flex-column gap-3">
      <Tabs activeKey={activeKey} onSelect={(key) => setActiveKey(key ?? "tracker")}>
        <Tab
          eventKey="tracker"
          title={
            <>
              <i className="bi bi-list-check me-1" aria-hidden="true"></i>
              Tracker
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
            onExportData={handleExportData}
            onImportData={handleImportData}
          />
        </Tab>
        <Tab
          eventKey="overview"
          title={
            <>
              <i className="bi bi-bar-chart-line me-1" aria-hidden="true"></i>
              Overview
            </>
          }
        >
          <WeeklyOverviewPanel tasks={tasks} />
        </Tab>
      </Tabs>
    </div>
  );
}
