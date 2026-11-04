import { LabelsPanel } from "@/features/timeTracking/LabelsPanel";
import { TemplatesPanel } from "@/features/timeTracking/TemplatesPanel";
import type { Label } from "@/lib/timeTracking/constants";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/timeTracking/types";
import type { GanttTask } from "@/types/gantt";

type SettingsTimeTrackingSectionProps = {
  labels: Label[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  ganttTasks: Pick<GanttTask, "label">[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplates: (templates: TimeTrackingTemplate[]) => void | Promise<void>;
  onUpdateLabels: (labels: Label[]) => void | Promise<void>;
  onReassignAndDeleteLabel: (labelId: string, replacementId: string) => Promise<void>;
};

export function SettingsTimeTrackingSection({
  labels,
  templates,
  tasks,
  ganttTasks,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUpdateTemplates,
  onUpdateLabels,
  onReassignAndDeleteLabel,
}: SettingsTimeTrackingSectionProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <LabelsPanel
        labels={labels}
        templates={templates}
        tasks={tasks}
        ganttTasks={ganttTasks}
        onUpdateLabels={onUpdateLabels}
        onReassignAndDeleteLabel={onReassignAndDeleteLabel}
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
