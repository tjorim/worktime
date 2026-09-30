import { Download as DownloadIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useEffect, useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
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
            <Icon icon={DownloadIcon} className="me-2" />
            {m.backup_app_data_label()}
          </DialogTitle>
        </DialogHeader>
        <div className="modal-body">
          <p className="fw-medium mb-2">{m.backup_include_label()}</p>
          <div className="d-flex flex-column gap-2">
            <Form.Check
              type="checkbox"
              id="backup-user-state"
              label={m.backup_include_settings()}
              checked={includeUserState}
              onChange={(e) => setIncludeUserState(e.target.checked)}
            />
            {presence?.hasTimeOff && (
              <Form.Check
                type="checkbox"
                id="backup-time-off"
                label={m.backup_include_time_off()}
                checked={includeTimeOff}
                onChange={(e) => setIncludeTimeOff(e.target.checked)}
              />
            )}
            {presence?.hasWorkLocations && (
              <Form.Check
                type="checkbox"
                id="backup-work-locations"
                label={m.backup_include_work_locations()}
                checked={includeWorkLocations}
                onChange={(e) => setIncludeWorkLocations(e.target.checked)}
              />
            )}
            {presence?.hasTasks && (
              <Form.Check
                type="checkbox"
                id="backup-tasks"
                label={m.backup_include_tasks()}
                checked={includeTasks}
                onChange={(e) => setIncludeTasks(e.target.checked)}
              />
            )}
            {(presence?.hasTemplates || presence?.hasLabels) && (
              <Form.Check
                type="checkbox"
                id="backup-templates-labels"
                label={m.backup_include_templates()}
                checked={includeTemplatesAndLabels}
                onChange={(e) => setIncludeTemplatesAndLabels(e.target.checked)}
              />
            )}
            {presence?.hasGanttTasks && (
              <Form.Check
                type="checkbox"
                id="backup-gantt-tasks"
                label={m.backup_include_gantt()}
                checked={includeGanttTasks}
                onChange={(e) => setIncludeGanttTasks(e.target.checked)}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline-secondary" onClick={onHide}>
            {m.cancel()}
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={nothingSelected}>
            <Icon icon={DownloadIcon} className="me-1" />
            {m.backup_export_btn()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
