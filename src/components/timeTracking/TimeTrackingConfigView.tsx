import type { TimeTrackingLabel } from "./constants";
import { LabelsPanel } from "./LabelsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";

type ImportPayload = {
  tasks?: unknown[];
  templates?: unknown[];
  labels?: unknown[];
};

type TimeTrackingConfigViewProps = {
  labels: TimeTrackingLabel[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateLabels: (labels: TimeTrackingLabel[]) => void;
  onImportData: (payload: ImportPayload) => void;
};

export function TimeTrackingConfigView({
  labels,
  templates,
  tasks,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUpdateLabels,
  onImportData,
}: TimeTrackingConfigViewProps) {
  return (
    <div className="d-flex flex-column gap-3">
      <LabelsPanel
        labels={labels}
        templates={templates}
        tasks={tasks}
        onUpdateLabels={onUpdateLabels}
      />

      <TemplatesPanel
        labels={labels}
        templates={templates}
        onAddTemplate={onAddTemplate}
        onUpdateTemplate={onUpdateTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onApplyTemplatesJson={(sanitized) => onImportData({ templates: sanitized })}
      />
    </div>
  );
}
