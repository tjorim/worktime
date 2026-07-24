import { LabelsPanel } from "@/components/timeTracking/LabelsPanel";
import { TemplatesPanel } from "@/components/timeTracking/TemplatesPanel";
import type { Label } from "@/components/timeTracking/constants";
import type {
  StoredTimeTrackingTask,
  TimeTrackingTemplate,
} from "@/components/timeTracking/types";

type SettingsTimeTrackingSectionProps = {
  labels: Label[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplates: (templates: TimeTrackingTemplate[]) => void;
  onUpdateLabels: (labels: Label[]) => void;
};

export function SettingsTimeTrackingSection({
  labels,
  templates,
  tasks,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUpdateTemplates,
  onUpdateLabels,
}: SettingsTimeTrackingSectionProps) {
  return (
    <div className="p-3 d-flex flex-column gap-3">
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
