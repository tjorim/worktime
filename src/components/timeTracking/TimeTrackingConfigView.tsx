import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { dayjs } from "../../utils/dateTimeUtils";
import type { TimeTrackingLabel } from "./constants";
import { LabelsPanel } from "./LabelsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import {
  downloadAppBackup,
  validateAppBackupPayload,
  restoreAppBackup,
} from "../../utils/appBackup";

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
  const [error, setError] = useState("");
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const handleBackupImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateAppBackupPayload(parsed)) {
        setError("Restore failed. Please select a valid backup file.");
        return;
      }
      restoreAppBackup(parsed);
    } catch {
      setError("Restore failed. Please select a valid backup file.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {error && (
        <Alert variant="danger" aria-live="polite">
          {error}
        </Alert>
      )}
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

      <div className="d-flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => downloadAppBackup(dayjs().format("YYYY-MM-DD"))}
        >
          Export Backup
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => backupFileInputRef.current?.click()}
        >
          Restore Backup
        </Button>
        <Form.Control
          ref={backupFileInputRef}
          type="file"
          accept="application/json"
          onChange={handleBackupImport}
          hidden
        />
      </div>
    </div>
  );
}
