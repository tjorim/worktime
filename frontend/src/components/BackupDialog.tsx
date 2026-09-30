import { Download as DownloadIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  checkBackupDataPresence,
  downloadAppBackup,
  type BackupDataPresence,
} from "@/utils/appBackup";
import * as m from "@/paraglide/messages.js";

interface BackupDialogProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Modal for exporting a selective backup of app data.
 *
 * Shows checkboxes for each data category that has content. All present
 * categories are pre-selected when the dialog opens.
 */
export function BackupDialog({ show, onHide }: BackupDialogProps) {
  const titleId = useId();

  const [presence, setPresence] = useState<BackupDataPresence | null>(null);
  const [includeUserState, setIncludeUserState] = useState(true);
  const [includeTimeOff, setIncludeTimeOff] = useState(false);
  const [includeWorkLocations, setIncludeWorkLocations] = useState(false);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [includeTemplatesAndLabels, setIncludeTemplatesAndLabels] = useState(false);
  const [includeGanttTasks, setIncludeGanttTasks] = useState(false);

  // Refresh presence and reset selections each time the dialog opens
  useEffect(() => {
    if (show) {
      const p = checkBackupDataPresence();
      setPresence(p);
      setIncludeUserState(p.hasUserState);
      setIncludeTimeOff(p.hasTimeOff);
      setIncludeWorkLocations(p.hasWorkLocations);
      setIncludeTasks(p.hasTasks);
      setIncludeTemplatesAndLabels(p.hasTemplates || p.hasLabels);
      setIncludeGanttTasks(p.hasGanttTasks);
    }
  }, [show]);

  const handleExport = () => {
    downloadAppBackup(dayjs().format("YYYY-MM-DD"), {
      includeUserState,
      includeTimeOff,
      includeWorkLocations,
      includeTasks,
      includeTemplates: includeTemplatesAndLabels,
      includeLabels: includeTemplatesAndLabels,
      includeGanttTasks,
    });
    onHide();
  };

  const nothingSelected =
    !includeUserState &&
    !includeTimeOff &&
    !includeWorkLocations &&
    !includeTasks &&
    !includeTemplatesAndLabels &&
    !includeGanttTasks;

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>
            <Icon icon={DownloadIcon} className="tw:me-2" />
            {m.backup_app_data_label()}
          </DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          <p className="tw:font-medium tw:mb-2">{m.backup_include_label()}</p>
          <div className="tw:flex tw:flex-col tw:gap-2">
            <Field orientation="horizontal">
              <Checkbox
                id="backup-user-state"
                checked={includeUserState}
                onCheckedChange={(checked) => setIncludeUserState(checked)}
              />
              <FieldLabel htmlFor="backup-user-state">{m.backup_include_settings()}</FieldLabel>
            </Field>
            {presence?.hasTimeOff && (
              <Field orientation="horizontal">
                <Checkbox
                  id="backup-time-off"
                  checked={includeTimeOff}
                  onCheckedChange={(checked) => setIncludeTimeOff(checked)}
                />
                <FieldLabel htmlFor="backup-time-off">{m.backup_include_time_off()}</FieldLabel>
              </Field>
            )}
            {presence?.hasWorkLocations && (
              <Field orientation="horizontal">
                <Checkbox
                  id="backup-work-locations"
                  checked={includeWorkLocations}
                  onCheckedChange={(checked) => setIncludeWorkLocations(checked)}
                />
                <FieldLabel htmlFor="backup-work-locations">
                  {m.backup_include_work_locations()}
                </FieldLabel>
              </Field>
            )}
            {presence?.hasTasks && (
              <Field orientation="horizontal">
                <Checkbox
                  id="backup-tasks"
                  checked={includeTasks}
                  onCheckedChange={(checked) => setIncludeTasks(checked)}
                />
                <FieldLabel htmlFor="backup-tasks">{m.backup_include_tasks()}</FieldLabel>
              </Field>
            )}
            {(presence?.hasTemplates || presence?.hasLabels) && (
              <Field orientation="horizontal">
                <Checkbox
                  id="backup-templates-labels"
                  checked={includeTemplatesAndLabels}
                  onCheckedChange={(checked) => setIncludeTemplatesAndLabels(checked)}
                />
                <FieldLabel htmlFor="backup-templates-labels">
                  {m.backup_include_templates()}
                </FieldLabel>
              </Field>
            )}
            {presence?.hasGanttTasks && (
              <Field orientation="horizontal">
                <Checkbox
                  id="backup-gantt-tasks"
                  checked={includeGanttTasks}
                  onCheckedChange={(checked) => setIncludeGanttTasks(checked)}
                />
                <FieldLabel htmlFor="backup-gantt-tasks">{m.backup_include_gantt()}</FieldLabel>
              </Field>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onHide}>
            {m.cancel()}
          </Button>
          <Button variant="default" onClick={handleExport} disabled={nothingSelected}>
            <Icon icon={DownloadIcon} className="tw:me-1" />
            {m.backup_export_btn()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
