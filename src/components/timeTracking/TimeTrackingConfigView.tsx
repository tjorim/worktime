import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import { dayjs } from "../../utils/dateTimeUtils";
import {
  isHexColor,
  isTimeTrackingLabel,
  normalizeLabelName,
  type TimeTrackingLabel,
} from "./constants";
import { TemplateModal } from "./TemplateModal";
import { isValidRange } from "./timeUtils";
import type { TimeTrackingTemplate } from "./types";

type ImportPayload = {
  tasks?: unknown[];
  templates?: unknown[];
  labels?: unknown[];
};

type LabelsImportPayload = {
  labels?: unknown[];
};

type TemplateFormState = {
  text: string;
  label: string;
  start: string;
  stop: string;
};

type LabelFormState = {
  name: string;
  color: string;
};

type TimeTrackingConfigViewProps = {
  labels: TimeTrackingLabel[];
  templates: TimeTrackingTemplate[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateLabels: (labels: TimeTrackingLabel[]) => void;
  onExportData: (date: string) => void;
  onImportData: (payload: ImportPayload) => void;
};

const EXAMPLE_LABELS_JSON = `{
  "labels": [
    { "name": "Support", "color": "#3B82F6" },
    { "name": "Project", "color": "#10B981" },
    { "name": "Meetings", "color": "#F59E0B" },
    { "name": "Admin", "color": "#8B5CF6" }
  ]
}`;

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

function validateLabelsImportPayload(parsed: unknown): parsed is LabelsImportPayload {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const payload = parsed as Record<string, unknown>;
  return Array.isArray(payload.labels);
}

function sanitizeLabels(labels: unknown[]): TimeTrackingLabel[] {
  const seen = new Set<string>();
  const sanitized: TimeTrackingLabel[] = [];

  labels.forEach((label) => {
    if (!isTimeTrackingLabel(label)) {
      return;
    }
    const name = normalizeLabelName(label.name);
    if (!name) {
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sanitized.push({ name, color: label.color });
  });

  return sanitized;
}

export function TimeTrackingConfigView({
  labels,
  templates,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onUpdateLabels,
  onExportData,
  onImportData,
}: TimeTrackingConfigViewProps) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [labelsJson, setLabelsJson] = useState(JSON.stringify({ labels }, null, 2));
  const [templateModalMode, setTemplateModalMode] = useState<"create" | "edit" | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({
    text: "",
    label: labels[0]?.name ?? "",
    start: "",
    stop: "",
  });
  const [labelForm, setLabelForm] = useState<LabelFormState>({
    name: "",
    color: labels[0]?.color ?? "#3B82F6",
  });

  const resetTemplateForm = () =>
    setTemplateForm({
      text: "",
      label: labels[0]?.name ?? "",
      start: "",
      stop: "",
    });

  const resetLabelForm = () =>
    setLabelForm({
      name: "",
      color: labels[0]?.color ?? "#3B82F6",
    });

  // Sync labelsJson state when labels prop changes
  useEffect(() => {
    setLabelsJson(JSON.stringify({ labels }, null, 2));
  }, [labels]);

  const handleCopyLabels = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(JSON.stringify({ labels }, null, 2));
      setStatus("Copied labels JSON to clipboard.");
    } catch {
      setError("Copy failed. Please copy the JSON manually from the text area.");
      setStatus("");
    }
  };

  const handleApplyLabelsJson = () => {
    setError("");
    setStatus("");

    try {
      const parsed = JSON.parse(labelsJson);
      if (!validateLabelsImportPayload(parsed)) {
        setError("Invalid labels JSON. Expected an object with a labels array.");
        return;
      }

      onUpdateLabels(sanitizeLabels(parsed.labels ?? []));
      setStatus("Labels updated.");
    } catch {
      setError("Invalid labels JSON. Please check the format and try again.");
    }
  };

  const handleStartLabelEdit = (label: TimeTrackingLabel) => {
    setEditLabelName(label.name);
    setLabelForm({
      name: label.name,
      color: label.color,
    });
  };

  const handleSaveLabel = () => {
    setError("");
    setStatus("");

    const name = normalizeLabelName(labelForm.name);
    if (!name) {
      setError("Label name is required.");
      return;
    }
    if (!isHexColor(labelForm.color)) {
      setError("Label color must be a valid hex value like #3B82F6.");
      return;
    }

    const key = name.toLowerCase();
    const hasDuplicate = labels.some(
      (label) =>
        label.name.toLowerCase() === key && (editLabelName === null || label.name !== editLabelName),
    );
    if (hasDuplicate) {
      setError("Label name must be unique.");
      return;
    }

    if (editLabelName) {
      const index = labels.findIndex((label) => label.name === editLabelName);
      if (index === -1) {
        return;
      }
      const nextLabels = [...labels];
      nextLabels[index] = { name, color: labelForm.color };
      onUpdateLabels(nextLabels);
      setStatus("Label updated.");
    } else {
      onUpdateLabels([...labels, { name, color: labelForm.color }]);
      setStatus("Label added.");
    }

    setEditLabelName(null);
    resetLabelForm();
  };

  const handleDeleteLabel = (label: TimeTrackingLabel) => {
    const usedByTemplates = templates.filter((template) => template.label === label.name).length;
    const confirmMessage =
      usedByTemplates > 0
        ? `Delete "${label.name}"? ${usedByTemplates} template(s) use this label.`
        : `Delete "${label.name}"?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    onUpdateLabels(labels.filter((item) => item.name !== label.name));
    setStatus("Label deleted.");
    if (editLabelName === label.name) {
      setEditLabelName(null);
      resetLabelForm();
    }
  };

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

  const handleSaveTemplate = () => {
    setError("");
    setStatus("");
    if (!templateForm.text || !templateForm.start || !templateForm.stop) {
      setError("Fill all template fields.");
      return;
    }
    if (!templateForm.label) {
      setError("Please configure at least one label.");
      return;
    }
    if (!isValidRange(templateForm.start, templateForm.stop)) {
      setError("Template stop time must be after start time.");
      return;
    }
    if (templateModalMode === "edit") {
      if (editTemplateId === null) {
        return;
      }
      onUpdateTemplate({ id: editTemplateId, template: templateForm });
      setStatus("Template updated.");
    } else {
      onAddTemplate(templateForm);
      setStatus("Template added.");
    }
    resetTemplateForm();
    setEditTemplateId(null);
    setTemplateModalMode(null);
  };

  const handleEditTemplate = (template: TimeTrackingTemplate) => {
    setEditTemplateId(template.id);
    setTemplateForm({
      text: template.text,
      label: template.label,
      start: template.start,
      stop: template.stop,
    });
    setTemplateModalMode("edit");
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

      <div className="border rounded p-3">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <h5 className="mb-0">Labels</h5>
        </div>
        <div className="d-flex flex-column gap-3">
          <Form>
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <Form.Group controlId="timeTrackingLabelName" className="flex-grow-1">
                <Form.Label className="mb-1">Label name</Form.Label>
                <Form.Control
                  value={labelForm.name}
                  onChange={(event) => setLabelForm({ ...labelForm, name: event.target.value })}
                  placeholder="e.g., Support"
                />
              </Form.Group>
              <Form.Group controlId="timeTrackingLabelColor">
                <Form.Label className="mb-1">Label color</Form.Label>
                <div className="d-flex gap-2 align-items-center">
                  <Form.Control
                    type="color"
                    value={labelForm.color}
                    onChange={(event) => setLabelForm({ ...labelForm, color: event.target.value })}
                    title="Select label color"
                    className="form-control-color"
                  />
                  <Form.Control
                    value={labelForm.color}
                    onChange={(event) => setLabelForm({ ...labelForm, color: event.target.value })}
                    placeholder="#3B82F6"
                  />
                </div>
              </Form.Group>
              <div className="d-flex gap-2 align-items-center">
                <Button size="sm" onClick={handleSaveLabel}>
                  {editLabelName ? "Save Label" : "Add Label"}
                </Button>
                {editLabelName && (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => {
                      setEditLabelName(null);
                      resetLabelForm();
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </Form>
          {labels.length > 0 && (
            <div className="small text-muted">
              {labels.length} label{labels.length === 1 ? "" : "s"} configured.
            </div>
          )}

          {labels.length === 0 ? (
            <div className="small text-muted">No labels configured yet.</div>
          ) : (
            <ListGroup>
              {labels.map((label) => {
                const usedByTemplates = templates.filter(
                  (template) => template.label === label.name,
                ).length;
                return (
                  <ListGroup.Item
                    key={label.name}
                    className="d-flex flex-wrap gap-2 align-items-center"
                  >
                    <span
                      className="time-tracking-label"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                    {usedByTemplates > 0 && (
                      <span className="small text-muted">
                        Used by {usedByTemplates} template{usedByTemplates === 1 ? "" : "s"}
                      </span>
                    )}
                    <div className="ms-auto d-flex gap-2">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => handleStartLabelEdit(label)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => handleDeleteLabel(label)}
                      >
                        Delete
                      </Button>
                    </div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          )}

          <details>
            <summary className="small text-muted">Raw labels JSON (import/export)</summary>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 my-2">
              <div className="fw-semibold">Labels JSON</div>
              <div className="d-flex flex-wrap gap-2">
                <Button size="sm" variant="outline-secondary" onClick={handleCopyLabels}>
                  Copy Labels JSON
                </Button>
                <Button size="sm" variant="outline-primary" onClick={handleApplyLabelsJson}>
                  Apply Labels JSON
                </Button>
              </div>
            </div>
            <Form.Control
              as="textarea"
              rows={8}
              className="textarea-mono"
              value={labelsJson}
              onChange={(event) => setLabelsJson(event.target.value)}
              aria-label="Labels JSON"
            />
            <div className="small text-muted mt-2">
              Format: <code>{`{"labels":[{"name":"Support","color":"#3B82F6"}]}`}</code>
            </div>
            <details className="mt-3">
              <summary className="small text-muted">Example labels JSON</summary>
              <pre className="textarea-mono time-tracking-codeblock small mt-2 mb-0 p-2 border rounded">
                <code>{EXAMPLE_LABELS_JSON}</code>
              </pre>
            </details>
          </details>
        </div>
      </div>

      <div className="border rounded p-3">
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Templates</h5>
          <Button
            size="sm"
            onClick={() => {
              resetTemplateForm();
              setEditTemplateId(null);
              setTemplateModalMode("create");
            }}
          >
            Add Template
          </Button>
        </div>
        {templates.length === 0 ? (
          <div className="small text-muted mt-2">No templates yet.</div>
        ) : (
          <ListGroup className="mt-2">
            {templates.map((template) => (
              <ListGroup.Item key={template.id} className="d-flex flex-wrap gap-2">
                <span className="me-auto">
                  {template.text} ({template.start}-{template.stop}) [{template.label}]
                </span>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => handleEditTemplate(template)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => onDeleteTemplate(template.id)}
                >
                  Delete
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </div>

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

      <TemplateModal
        show={templateModalMode !== null}
        title={templateModalMode === "edit" ? "Edit Template" : "Add New Template"}
        submitLabel={templateModalMode === "edit" ? "Save Changes" : "Save Template"}
        labels={labels}
        value={templateForm}
        onChange={setTemplateForm}
        onClose={() => {
          resetTemplateForm();
          setEditTemplateId(null);
          setTemplateModalMode(null);
        }}
        onSubmit={handleSaveTemplate}
      />
    </div>
  );
}
