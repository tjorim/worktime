import type { TimeTrackingLabel } from "./labelTypes";
import { LabelsPanel } from "./LabelsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";

type TimeTrackingConfigViewProps = {
  labels: TimeTrackingLabel[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplates: (templates: TimeTrackingTemplate[]) => void;
  onUpdateLabels: (labels: TimeTrackingLabel[]) => void;
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
