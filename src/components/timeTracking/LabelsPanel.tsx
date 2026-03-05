import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useToast } from "../../contexts/ToastContext";
import ListGroup from "react-bootstrap/ListGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { EmptyState } from "../shared/EmptyState";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { RawJsonEditor } from "./RawJsonEditor";
import {
  getContrastingTextColor,
  isHexColor,
  normalizeLabelName,
  sanitizeLabels,
  type TimeTrackingLabel,
} from "./constants";
import { LabelModal } from "./LabelModal";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "./types";
import * as m from "../../paraglide/messages.js";

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

const EXAMPLE_LABELS: TimeTrackingLabel[] = [
  { id: "label-1", name: "Support", color: "#3B82F6" },
  { id: "label-2", name: "Project", color: "#10B981" },
  { id: "label-3", name: "Meetings", color: "#F59E0B" },
  { id: "label-4", name: "Admin", color: "#8B5CF6" },
];
const EXAMPLE_LABELS_JSON = JSON.stringify({ labels: EXAMPLE_LABELS }, null, 2);

function validateLabelsImportPayload(parsed: unknown): parsed is { labels?: unknown[] } {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const payload = parsed as Record<string, unknown>;
  return Array.isArray(payload.labels);
}

export function LabelsPanel({ labels, templates, tasks, onUpdateLabels }: LabelsPanelProps) {
  const [error, setError] = useState("");
  const toast = useToast();
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

  const usageByLabelId = useMemo(() => {
    const map: Record<string, { templates: number; tasks: number }> = {};
    for (const label of labels) {
      map[label.id] = { templates: 0, tasks: 0 };
    }
    for (const template of templates) {
      const entry = map[template.label];
      if (entry) {
        entry.templates++;
      }
    }
    for (const task of tasks) {
      const entry = map[task.label];
      if (entry) {
        entry.tasks++;
      }
    }
    return map;
  }, [labels, templates, tasks]);

  useEffect(() => {
    setLabelsJson(JSON.stringify({ labels }, null, 2));
  }, [labels]);

  const handleCopy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(JSON.stringify({ labels }, null, 2));
      toast.showSuccess(m.tt_copied_labels());
    } catch {
      setError(m.tt_copy_labels_failed_msg());
    }
  };

  const handleApplyJson = () => {
    setError("");

    try {
      const parsed = JSON.parse(labelsJson);
      if (!validateLabelsImportPayload(parsed)) {
        setError(m.tt_invalid_labels_structure());
        return;
      }

      onUpdateLabels(sanitizeLabels(parsed.labels ?? []));
      toast.showSuccess(m.tt_labels_updated());
    } catch {
      setError(m.tt_invalid_labels_format());
    }
  };

  const handleEdit = (label: TimeTrackingLabel) => {
    setError("");
    setEditLabelId(label.id);
    setLabelForm({
      name: label.name,
      color: label.color,
    });
    setModalMode("edit");
  };

  const handleSave = () => {
    setError("");

    const name = normalizeLabelName(labelForm.name);
    if (!name) {
      setError(m.tt_label_name_required());
      return;
    }
    if (!isHexColor(labelForm.color)) {
      setError(m.tt_label_color_invalid());
      return;
    }

    const key = name.toLowerCase();
    const hasDuplicate = labels.some(
      (label) =>
        label.name.toLowerCase() === key && (editLabelId === null || label.id !== editLabelId),
    );
    if (hasDuplicate) {
      setError(m.tt_label_name_unique());
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
      toast.showSuccess(m.tt_label_updated());
    } else {
      onUpdateLabels([...labels, { id: crypto.randomUUID(), name, color: labelForm.color }]);
      toast.showSuccess(m.tt_label_added());
    }

    resetForm();
    setEditLabelId(null);
    setModalMode(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteLabel) {
      return;
    }
    onUpdateLabels(labels.filter((item) => item.id !== pendingDeleteLabel.id));
    toast.showSuccess(m.tt_label_deleted());
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
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h5 className="mb-0">
          <i className="bi bi-tags me-2" aria-hidden="true"></i>
          {m.tt_labels_heading()}
        </h5>
        <Button
          size="sm"
          onClick={() => {
            setError("");
            resetForm();
            setEditLabelId(null);
            setModalMode("create");
          }}
        >
          {m.tt_add_label_btn()}
        </Button>
      </div>
      <div className="d-flex flex-column gap-3">
        {labels.length > 0 && (
          <div className="small text-muted">
            {m.tt_labels_configured({ count: labels.length })}
          </div>
        )}

        {labels.length === 0 ? (
          <div className="border rounded bg-body-tertiary">
            <EmptyState
              icon="bi-tags"
              title={m.tt_no_labels_title()}
              description={m.tt_no_labels_desc()}
              ctaButton={{
                label: m.tt_add_first_label(),
                onClick: () => {
                  setError("");
                  resetForm();
                  setEditLabelId(null);
                  setModalMode("create");
                },
              }}
            />
          </div>
        ) : (
          <ListGroup>
            {labels.map((label) => {
              const usage = usageByLabelId[label.id];
              const usageParts: string[] = [];
              if (usage?.templates) {
                usageParts.push(`${usage.templates} template${usage.templates === 1 ? "" : "s"}`);
              }
              if (usage?.tasks) {
                usageParts.push(`${usage.tasks} task${usage.tasks === 1 ? "" : "s"}`);
              }
              const isInUse = usageParts.length > 0;
              return (
                <ListGroup.Item
                  key={label.id}
                  className="d-flex flex-wrap gap-2 align-items-center"
                >
                  <span
                    className="time-tracking-label"
                    style={{
                      backgroundColor: label.color,
                      color: getContrastingTextColor(label.color),
                    }}
                  >
                    {label.name}
                  </span>
                  {isInUse && (
                    <span className="small text-muted">
                      {m.tt_label_used_by({ context: usageParts.join(", ") })}
                    </span>
                  )}
                  <div className="ms-auto d-flex gap-2">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      aria-label={m.tt_edit_label_aria({ name: label.name })}
                      onClick={() => handleEdit(label)}
                    >
                      {m.edit()}
                    </Button>
                    {isInUse ? (
                      <OverlayTrigger
                        trigger={["hover", "focus"]}
                        overlay={
                          <Tooltip id={`delete-label-${label.id}`}>
                            {m.tt_label_in_use_tooltip({ usage: usageParts.join(" and ") })}
                          </Tooltip>
                        }
                      >
                        <span className="d-inline-block" tabIndex={0}>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            aria-label={m.tt_delete_label_aria({ name: label.name })}
                            disabled
                            style={{ pointerEvents: "none" }}
                          >
                            {m.delete()}
                          </Button>
                        </span>
                      </OverlayTrigger>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        aria-label={m.tt_delete_label_aria({ name: label.name })}
                        onClick={() => setPendingDeleteLabel(label)}
                      >
                        {m.delete()}
                      </Button>
                    )}
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}

        <RawJsonEditor
          summaryLabel={m.tt_raw_json_summary({ label: m.tt_labels_heading().toLowerCase() })}
          headingLabel={m.tt_json_heading({ label: m.tt_labels_heading() })}
          copyButtonLabel={m.tt_copy_json({ label: m.tt_labels_heading() })}
          applyButtonLabel={m.tt_apply_json({ label: m.tt_labels_heading() })}
          ariaLabel={m.tt_json_aria({ label: m.tt_labels_heading() })}
          formatLabel={m.tt_format()}
          value={labelsJson}
          formatHint={`{"labels":[{"id":"label-1","name":"Support","color":"#3B82F6"}]}`}
          onChange={setLabelsJson}
          onCopy={handleCopy}
          onApply={handleApplyJson}
        >
          <details className="mt-3">
            <summary className="small text-muted">{m.tt_example_labels_json()}</summary>
            <pre className="textarea-mono time-tracking-codeblock small mt-2 mb-0 p-2 border rounded">
              <code>{EXAMPLE_LABELS_JSON}</code>
            </pre>
          </details>
        </RawJsonEditor>
      </div>

      <LabelModal
        show={modalMode !== null}
        title={modalMode === "edit" ? m.tt_edit_label_title() : m.tt_add_label_title()}
        submitLabel={modalMode === "edit" ? m.tt_save_changes() : m.tt_save_label()}
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
        title={m.tt_delete_label_title()}
        message={pendingDeleteLabel ? m.tt_delete_item_message({ name: pendingDeleteLabel.name }) : ""}
        confirmLabel={m.delete()}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteLabel(null)}
      />
    </div>
  );
}
