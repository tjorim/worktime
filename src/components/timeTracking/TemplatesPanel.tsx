import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useToast } from "../../contexts/ToastContext";
import ListGroup from "react-bootstrap/ListGroup";
import { EmptyState } from "../shared/EmptyState";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { RawJsonEditor } from "./RawJsonEditor";
import { buildLabelNameMap, type TimeTrackingLabel } from "./constants";
import { TemplateModal } from "./TemplateModal";
import { isValidRange, isValidTimeString } from "./timeUtils";
import type { TimeTrackingTemplate } from "./types";

type TemplateFormState = {
  text: string;
  label: string;
  start: string;
  stop: string;
};

type TemplatesPanelProps = {
  labels: TimeTrackingLabel[];
  templates: TimeTrackingTemplate[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onApplyTemplatesJson: (templates: TimeTrackingTemplate[]) => void;
};

const EXAMPLE_TEMPLATES: TimeTrackingTemplate[] = [
  { id: "template-1", text: "Support", label: "label-1", start: "09:00", stop: "11:00" },
  { id: "template-2", text: "Project work", label: "label-2", start: "11:00", stop: "13:00" },
  { id: "template-3", text: "Team meeting", label: "label-3", start: "14:00", stop: "15:00" },
  { id: "template-4", text: "Admin tasks", label: "label-4", start: "15:00", stop: "17:00" },
];
const EXAMPLE_TEMPLATES_JSON = JSON.stringify({ templates: EXAMPLE_TEMPLATES }, null, 2);

function validateTemplatesImportPayload(parsed: unknown): parsed is { templates?: unknown[] } {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const payload = parsed as Record<string, unknown>;
  return Array.isArray(payload.templates);
}

function sanitizeTemplates(templates: unknown[]): TimeTrackingTemplate[] {
  const sanitized: TimeTrackingTemplate[] = [];

  templates.forEach((template) => {
    if (!template || typeof template !== "object") {
      return;
    }
    const payload = template as Record<string, unknown>;
    const label = typeof payload.label === "string" ? payload.label : undefined;
    if (
      typeof payload.text !== "string" ||
      !isValidTimeString(payload.start) ||
      !isValidTimeString(payload.stop) ||
      !isValidRange(payload.start, payload.stop) ||
      !label
    ) {
      return;
    }
    sanitized.push({
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      text: payload.text,
      label,
      start: payload.start,
      stop: payload.stop,
    });
  });

  return sanitized;
}

export function TemplatesPanel({
  labels,
  templates,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onApplyTemplatesJson,
}: TemplatesPanelProps) {
  const [error, setError] = useState("");
  const toast = useToast();
  const [templatesJson, setTemplatesJson] = useState(JSON.stringify({ templates }, null, 2));
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<TimeTrackingTemplate | null>(
    null,
  );
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({
    text: "",
    label: labels[0]?.id ?? "",
    start: "",
    stop: "",
  });

  const resetForm = () =>
    setTemplateForm({
      text: "",
      label: labels[0]?.id ?? "",
      start: "",
      stop: "",
    });

  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);

  useEffect(() => {
    setTemplatesJson(JSON.stringify({ templates }, null, 2));
  }, [templates]);

  const handleCopy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(JSON.stringify({ templates }, null, 2));
      toast.showSuccess("Copied templates JSON to clipboard.");
    } catch {
      setError("Copy failed. Please copy the JSON manually from the text area.");
    }
  };

  const handleApplyJson = () => {
    setError("");

    try {
      const parsed = JSON.parse(templatesJson);
      if (!validateTemplatesImportPayload(parsed)) {
        setError("Invalid templates JSON. Expected an object with a templates array.");
        return;
      }

      onApplyTemplatesJson(sanitizeTemplates(parsed.templates ?? []));
      toast.showSuccess("Templates updated.");
    } catch {
      setError("Invalid templates JSON. Please check the format and try again.");
    }
  };

  const handleEdit = (template: TimeTrackingTemplate) => {
    setError("");
    setEditTemplateId(template.id);
    setTemplateForm({
      text: template.text,
      label: template.label,
      start: template.start,
      stop: template.stop,
    });
    setModalMode("edit");
  };

  const handleSave = () => {
    setError("");
    if (!templateForm.text || !templateForm.start || !templateForm.stop) {
      setError("Fill all template fields.");
      return;
    }
    if (!templateForm.label) {
      setError("Please configure at least one label.");
      return;
    }
    if (!labels.some((l) => l.id === templateForm.label)) {
      setError("Selected label no longer exists. Please choose another label.");
      return;
    }
    if (!isValidRange(templateForm.start, templateForm.stop)) {
      setError("Template stop time must be after start time.");
      return;
    }
    const templatePayload: Omit<TimeTrackingTemplate, "id"> = {
      ...templateForm,
    };
    if (modalMode === "edit") {
      if (editTemplateId === null) {
        return;
      }
      onUpdateTemplate({ id: editTemplateId, template: templatePayload });
      toast.showSuccess("Template updated.");
    } else {
      onAddTemplate(templatePayload);
      toast.showSuccess("Template added.");
    }
    resetForm();
    setEditTemplateId(null);
    setModalMode(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteTemplate) {
      return;
    }
    onDeleteTemplate(pendingDeleteTemplate.id);
    toast.showSuccess("Template deleted.");
    setPendingDeleteTemplate(null);
  };

  return (
    <div className="border rounded p-3">
      {error && (
        <Alert variant="danger" aria-live="polite">
          {error}
        </Alert>
      )}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h5 className="mb-0">
          <i className="bi bi-clipboard-check me-2" aria-hidden="true"></i>
          Templates
        </h5>
        <Button
          size="sm"
          onClick={() => {
            setError("");
            resetForm();
            setEditTemplateId(null);
            setModalMode("create");
          }}
        >
          Add Template
        </Button>
      </div>
      <div className="d-flex flex-column gap-3">
        {templates.length === 0 ? (
          <div className="border rounded bg-body-tertiary">
            <EmptyState
              icon="bi-file-earmark-text"
              title="No Templates Yet"
              description="Templates let you quickly add recurring tasks. Create a template for tasks you log regularly."
              ctaButton={{
                label: "Add Your First Template",
                onClick: () => {
                  setError("");
                  resetForm();
                  setEditTemplateId(null);
                  setModalMode("create");
                },
              }}
            />
          </div>
        ) : (
          <ListGroup>
            {templates.map((template) => (
              <ListGroup.Item key={template.id} className="d-flex flex-wrap gap-2">
                <span className="me-auto">
                  {template.text} ({template.start}-{template.stop}) [
                  {labelNameById[template.label] ?? "Unknown label"}]
                </span>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  aria-label={`Edit ${template.text}`}
                  onClick={() => handleEdit(template)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  aria-label={`Delete ${template.text}`}
                  onClick={() => setPendingDeleteTemplate(template)}
                >
                  Delete
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}

        <RawJsonEditor
          label="Templates"
          value={templatesJson}
          formatHint={`{"templates":[{"id":"template-1","text":"Support","label":"label-1","start":"09:00","stop":"11:00"}]}`}
          onChange={setTemplatesJson}
          onCopy={handleCopy}
          onApply={handleApplyJson}
        >
          <details className="mt-3">
            <summary className="small text-muted">Example templates JSON</summary>
            <pre className="textarea-mono time-tracking-codeblock small mt-2 mb-0 p-2 border rounded">
              <code>{EXAMPLE_TEMPLATES_JSON}</code>
            </pre>
          </details>
        </RawJsonEditor>
      </div>

      <TemplateModal
        show={modalMode !== null}
        title={modalMode === "edit" ? "Edit Template" : "Add New Template"}
        submitLabel={modalMode === "edit" ? "Save Changes" : "Save Template"}
        labels={labels}
        value={templateForm}
        onChange={setTemplateForm}
        onClose={() => {
          resetForm();
          setEditTemplateId(null);
          setModalMode(null);
        }}
        onSubmit={handleSave}
      />

      <ConfirmationDialog
        isOpen={pendingDeleteTemplate !== null}
        title="Delete Template"
        message={pendingDeleteTemplate ? `Delete "${pendingDeleteTemplate.text}"?` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteTemplate(null)}
      />
    </div>
  );
}
