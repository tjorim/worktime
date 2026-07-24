import type { Label } from "./constants";
import { LabelsPanel } from "./LabelsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";

type TimeTrackingConfigViewProps = {
  labels: Label[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplates: (templates: TimeTrackingTemplate[]) => void;
  onUpdateLabels: (labels: Label[]) => void;
};

export function TimeTrackingConfigView({
  labels,
  templates,
  tasks,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUpdateTemplates,
  onUpdateLabels,
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
        onUpdateTemplates={onUpdateTemplates}
      />
    </div>
  );
}
