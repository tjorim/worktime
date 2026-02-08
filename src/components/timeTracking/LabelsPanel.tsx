import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { RawJsonEditor } from "./RawJsonEditor";
import {
  isHexColor,
  isTimeTrackingLabel,
  normalizeLabelName,
  type TimeTrackingLabel,
} from "./constants";
import { LabelModal } from "./LabelModal";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";

type LabelFormState = {
  name: string;
  color: string;
};

type LabelsPanelProps = {
  labels: TimeTrackingLabel[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  onUpdateLabels: (labels: TimeTrackingLabel[]) => void;
};

const EXAMPLE_LABELS_JSON = `{
  "labels": [
    { "id": "label-1", "name": "Support", "color": "#3B82F6" },
    { "id": "label-2", "name": "Project", "color": "#10B981" },
    { "id": "label-3", "name": "Meetings", "color": "#F59E0B" },
    { "id": "label-4", "name": "Admin", "color": "#8B5CF6" }
  ]
}`;

function validateLabelsImportPayload(parsed: unknown): parsed is { labels?: unknown[] } {
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
    sanitized.push({
      id: typeof label.id === "string" ? label.id : crypto.randomUUID(),
      name,
      color: label.color,
    });
  });

  return sanitized;
}

export function LabelsPanel({ labels, templates, tasks, onUpdateLabels }: LabelsPanelProps) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [labelsJson, setLabelsJson] = useState(JSON.stringify({ labels }, null, 2));
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editLabelId, setEditLabelId] = useState<string | null>(null);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<TimeTrackingLabel | null>(null);
  const [labelForm, setLabelForm] = useState<LabelFormState>({
    name: "",
    color: labels[0]?.color ?? "#3B82F6",
  });

  const resetForm = () =>
    setLabelForm({
      name: "",
      color: labels[0]?.color ?? "#3B82F6",
    });

  useEffect(() => {
    setLabelsJson(JSON.stringify({ labels }, null, 2));
  }, [labels]);

  const handleCopy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(JSON.stringify({ labels }, null, 2));
      setStatus("Copied labels JSON to clipboard.");
    } catch {
      setError("Copy failed. Please copy the JSON manually from the text area.");
      setStatus("");
    }
  };

  const handleApplyJson = () => {
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

  const handleStartEdit = (label: TimeTrackingLabel) => {
    setEditLabelId(label.id);
    setLabelForm({
      name: label.name,
      color: label.color,
    });
    setModalMode("edit");
  };

  const handleSave = () => {
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
        label.name.toLowerCase() === key && (editLabelId === null || label.id !== editLabelId),
    );
    if (hasDuplicate) {
      setError("Label name must be unique.");
      return;
    }

    if (editLabelId) {
      const index = labels.findIndex((label) => label.id === editLabelId);
      if (index === -1) {
        return;
      }
      const nextLabels = [...labels];
      nextLabels[index] = { id: editLabelId, name, color: labelForm.color };
      onUpdateLabels(nextLabels);
      setStatus("Label updated.");
    } else {
      onUpdateLabels([...labels, { id: crypto.randomUUID(), name, color: labelForm.color }]);
      setStatus("Label added.");
    }

    setEditLabelId(null);
    resetForm();
    setModalMode(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteLabel) {
      return;
    }
    onUpdateLabels(labels.filter((item) => item.id !== pendingDeleteLabel.id));
    setStatus("Label deleted.");
    if (editLabelId === pendingDeleteLabel.id) {
      setEditLabelId(null);
      resetForm();
      setModalMode(null);
    }
    setPendingDeleteLabel(null);
  };

  return (
    <div className="border rounded p-3">
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

      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h5 className="mb-0">Labels</h5>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setEditLabelId(null);
            setModalMode("create");
          }}
        >
          Add Label
        </Button>
      </div>
      <div className="d-flex flex-column gap-3">
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
                (template) => template.label === label.id,
              ).length;
              const usedByTasks = tasks.filter((task) => task.label === label.id).length;
              const isInUse = usedByTemplates > 0 || usedByTasks > 0;
              const usageParts: string[] = [];
              if (usedByTemplates > 0) {
                usageParts.push(`${usedByTemplates} template${usedByTemplates === 1 ? "" : "s"}`);
              }
              if (usedByTasks > 0) {
                usageParts.push(`${usedByTasks} task${usedByTasks === 1 ? "" : "s"}`);
              }
              return (
                <ListGroup.Item
                  key={label.id}
                  className="d-flex flex-wrap gap-2 align-items-center"
                >
                  <span className="time-tracking-label" style={{ backgroundColor: label.color }}>
                    {label.name}
                  </span>
                  {isInUse && (
                    <span className="small text-muted">Used by {usageParts.join(" and ")}</span>
                  )}
                  <div className="ms-auto d-flex gap-2">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => handleStartEdit(label)}
                    >
                      Edit
                    </Button>
                    {isInUse ? (
                      <OverlayTrigger
                        trigger={["hover", "focus"]}
                        overlay={
                          <Tooltip id={`delete-label-${label.id}`}>
                            Used by {usageParts.join(" and ")}. Remove them first.
                          </Tooltip>
                        }
                      >
                        <span className="d-inline-block" tabIndex={0}>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            disabled
                            style={{ pointerEvents: "none" }}
                          >
                            Delete
                          </Button>
                        </span>
                      </OverlayTrigger>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => setPendingDeleteLabel(label)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}

        <RawJsonEditor
          label="Labels"
          value={labelsJson}
          formatHint={`{"labels":[{"id":"label-1","name":"Support","color":"#3B82F6"}]}`}
          onChange={setLabelsJson}
          onCopy={handleCopy}
          onApply={handleApplyJson}
        >
          <details className="mt-3">
            <summary className="small text-muted">Example labels JSON</summary>
            <pre className="textarea-mono time-tracking-codeblock small mt-2 mb-0 p-2 border rounded">
              <code>{EXAMPLE_LABELS_JSON}</code>
            </pre>
          </details>
        </RawJsonEditor>
      </div>

      <LabelModal
        show={modalMode !== null}
        title={modalMode === "edit" ? "Edit Label" : "Add New Label"}
        submitLabel={modalMode === "edit" ? "Save Changes" : "Save Label"}
        value={labelForm}
        onChange={setLabelForm}
        onClose={() => {
          resetForm();
          setEditLabelId(null);
          setModalMode(null);
        }}
        onSubmit={handleSave}
      />

      <ConfirmationDialog
        isOpen={pendingDeleteLabel !== null}
        title="Delete Label"
        message={pendingDeleteLabel ? `Delete "${pendingDeleteLabel.name}"?` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteLabel(null)}
      />
    </div>
  );
}
