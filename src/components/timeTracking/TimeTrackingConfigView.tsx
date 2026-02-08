import { useState } from "react";
import type { ChangeEvent } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { dayjs } from "../../utils/dateTimeUtils";
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
  onExportData: (date: string) => void;
  onImportData: (payload: ImportPayload) => void;
};

function validateImportPayload(parsed: unknown): parsed is ImportPayload {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const payload = parsed as Record<string, unknown>;
  const hasAnySection = "tasks" in payload || "templates" in payload || "labels" in payload;
  if (!hasAnySection) {
    return false;
  }

  if ("tasks" in payload && payload.tasks !== undefined && !Array.isArray(payload.tasks)) {
    return false;
  }
  if (
    "templates" in payload &&
    payload.templates !== undefined &&
    !Array.isArray(payload.templates)
  ) {
    return false;
  }
  if ("labels" in payload && payload.labels !== undefined && !Array.isArray(payload.labels)) {
    return false;
  }

  return true;
}

export function TimeTrackingConfigView({
  labels,
  templates,
  tasks,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUpdateLabels,
  onExportData,
  onImportData,
}: TimeTrackingConfigViewProps) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateImportPayload(parsed)) {
        setError("Import failed. Please select a valid export file.");
        setStatus("");
        return;
      }
      onImportData(parsed);
      setError("");
      setStatus("Imported time tracking data.");
    } catch {
      setError("Import failed. Please select a valid export file.");
      setStatus("");
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
      {status && (
        <Alert variant="success" aria-live="polite">
          {status}
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
          onClick={() => onExportData(dayjs().format("YYYY-MM-DD"))}
        >
          Export Data
        </Button>
        <Form.Label className="btn btn-outline-secondary btn-sm mb-0">
          Import Data
          <Form.Control type="file" accept="application/json" onChange={handleImport} hidden />
        </Form.Label>
      </div>
    </div>
  );
}
