import { useJsonDraft } from "@/features/timeTracking/useJsonDraft";
import { getErrorMessage } from "@/utils/apiError";
import { TagsIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { Hint } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { JsonExample, RawJsonEditor } from "./RawJsonEditor";
import { LabelChip } from "./LabelChip";
import {
  isHexColor,
  isLabelInput,
  normalizeLabelName,
  sanitizeLabels,
  type Label,
} from "@/lib/timeTracking/constants";
import { LabelModal } from "./LabelModal";
import type { StoredTimeTrackingTask, TimeTrackingTemplate } from "@/lib/timeTracking/types";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

type LabelFormState = {
  name: string;
  color: string;
};

type LabelsPanelProps = {
  labels: Label[];
  templates: TimeTrackingTemplate[];
  tasks: StoredTimeTrackingTask[];
  onUpdateLabels: (labels: Label[], confirmedRemoval?: boolean) => void | Promise<void>;
};

const EXAMPLE_LABELS: Label[] = [
  { id: "label-1", name: "Support", color: "#3B82F6" },
  { id: "label-2", name: "Project", color: "#10B981" },
  { id: "label-3", name: "Meetings", color: "#F59E0B" },
  { id: "label-4", name: "Admin", color: "#8B5CF6" },
];
const EXAMPLE_LABELS_JSON = JSON.stringify({ labels: EXAMPLE_LABELS }, null, 2);

function validateLabelsImportPayload(parsed: unknown): parsed is { labels: unknown[] } {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const payload = parsed as Record<string, unknown>;
  return Array.isArray(payload.labels);
}

export function LabelsPanel({ labels, templates, tasks, onUpdateLabels }: LabelsPanelProps) {
  const addLabelRef = useRef<HTMLButtonElement>(null);
  const deleteFocusRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const draft = useJsonDraft(JSON.stringify({ labels }, null, 2));
  const { value: labelsJson, setValue: setLabelsJson } = draft;
  const [pendingJson, setPendingJson] = useState<Label[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editLabelId, setEditLabelId] = useState<string | null>(null);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<Label | null>(null);
  const [labelForm, setLabelForm] = useState<LabelFormState>({
    name: "",
    color: labels[0]?.color ?? "#3B82F6",
  });
  const pluralRules = useMemo(() => new Intl.PluralRules(getLocale()), []);

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

  const handleCopy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(JSON.stringify({ labels }, null, 2));
      toast.showSuccess(m.tt_copied_labels());
    } catch {
      setError(m.tt_copy_labels_failed_msg());
    }
  };

  const saveJson = async (next: Label[], confirmedRemoval = false) => {
    if (saving || draft.conflict) return;
    setSaving(true);
    try {
      await onUpdateLabels(next, confirmedRemoval);
      draft.saved();
      toast.showSuccess(m.tt_labels_updated());
      setPendingJson(null);
    } catch (error) {
      setError(getErrorMessage(error, m.tt_json_save_failed()));
      setPendingJson(null);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyJson = () => {
    setError("");
    if (saving || draft.conflict) return;
    try {
      const parsed = JSON.parse(labelsJson);
      if (!validateLabelsImportPayload(parsed)) {
        setError(m.tt_invalid_labels_structure());
        return;
      }
      const next = sanitizeLabels(parsed.labels);
      const invalid = parsed.labels.filter((item: unknown) => !isLabelInput(item)).length;
      if (
        invalid ||
        next.length !== parsed.labels.length ||
        new Set(next.map((item) => item.id)).size !== next.length
      ) {
        setError(
          m.tt_json_invalid_entries({ count: invalid || parsed.labels.length - next.length || 1 }),
        );
        return;
      }
      const blocked = labels.filter(
        (label) =>
          !next.some((item) => item.id === label.id) &&
          (usageByLabelId[label.id]?.tasks || usageByLabelId[label.id]?.templates),
      );
      if (blocked.length) {
        setError(m.tt_json_in_use({ names: blocked.map((item) => item.name).join(", ") }));
        return;
      }

      if (labels.some((item) => !next.some((entry) => entry.id === item.id))) setPendingJson(next);
      else void saveJson(next);
    } catch {
      setError(m.tt_invalid_labels_format());
    }
  };

  const handleEdit = (label: Label) => {
    setError("");
    setEditLabelId(label.id);
    setLabelForm({
      name: label.name,
      color: label.color,
    });
    setModalMode("edit");
  };

  const handleSave = async () => {
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

    try {
      if (editLabelId) {
        const index = labels.findIndex((label) => label.id === editLabelId);
        if (index === -1) {
          return;
        }
        const nextLabels = [...labels];
        nextLabels[index] = { id: editLabelId, name, color: labelForm.color };
        await onUpdateLabels(nextLabels);
        toast.showSuccess(m.tt_label_updated());
      } else {
        await onUpdateLabels([
          ...labels,
          { id: crypto.randomUUID(), name, color: labelForm.color },
        ]);
        toast.showSuccess(m.tt_label_added());
      }

      resetForm();
      setEditLabelId(null);
      setModalMode(null);
    } catch (error) {
      setError(getErrorMessage(error, m.tt_json_save_failed()));
    }
  };

  const handleConfirmDelete = async () => {
    if (saving || !pendingDeleteLabel) {
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onUpdateLabels(
        labels.filter((item) => item.id !== pendingDeleteLabel.id),
        true,
      );
    } catch (error) {
      setError(getErrorMessage(error, m.tt_json_save_failed()));
      setPendingDeleteLabel(null);
      return;
    } finally {
      setSaving(false);
    }
    deleteFocusRef.current = addLabelRef.current;
    toast.showSuccess(m.tt_label_deleted());
    if (editLabelId === pendingDeleteLabel.id) {
      setEditLabelId(null);
      resetForm();
      setModalMode(null);
    }
    setPendingDeleteLabel(null);
  };

  return (
    <div className="rounded-lg border border-border p-3">
      {error && (
        <Alert variant="destructive" aria-live="polite" className="mb-3">
          {error}
        </Alert>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h5 className="mb-0 text-xl">
          <Icon icon={TagsIcon} className="mr-2" />
          {m.tt_labels_heading()}
        </h5>
        <Button
          ref={addLabelRef}
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
      <div className="flex flex-col gap-3">
        {labels.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {pluralRules.select(labels.length) === "one"
              ? m.tt_labels_configured_one({ count: labels.length })
              : m.tt_labels_configured_other({ count: labels.length })}
          </div>
        )}

        {labels.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted">
            <EmptyState
              icon={TagsIcon}
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
          <div className="divide-y divide-border rounded-lg border border-border">
            {labels.map((label) => {
              const usage = usageByLabelId[label.id];
              const usageParts: string[] = [];
              if (usage?.templates) {
                usageParts.push(
                  pluralRules.select(usage.templates) === "one"
                    ? m.tt_template_count_one({ count: usage.templates })
                    : m.tt_template_count_other({ count: usage.templates }),
                );
              }
              if (usage?.tasks) {
                usageParts.push(
                  pluralRules.select(usage.tasks) === "one"
                    ? m.tt_task_count_one({ count: usage.tasks })
                    : m.tt_task_count_other({ count: usage.tasks }),
                );
              }
              const isInUse = usageParts.length > 0;
              return (
                <div key={label.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <LabelChip color={label.color}>{label.name}</LabelChip>
                  {isInUse && (
                    <span className="text-sm text-muted-foreground">
                      {m.tt_label_used_by({ context: usageParts.join(` ${m.tt_and()} `) })}
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={m.tt_edit_label_aria({ name: label.name })}
                      onClick={() => handleEdit(label)}
                    >
                      {m.edit()}
                    </Button>
                    {isInUse ? (
                      <Hint
                        content={
                          <div id={`delete-label-${label.id}`}>
                            {m.tt_label_in_use_tooltip({
                              usage: usageParts.join(` ${m.tt_and()} `),
                            })}
                          </div>
                        }
                      >
                        <span className="inline-block" tabIndex={0}>
                          <Button
                            size="sm"
                            variant="destructive"
                            aria-label={m.tt_delete_label_aria({ name: label.name })}
                            disabled
                          >
                            {m.delete()}
                          </Button>
                        </span>
                      </Hint>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        aria-label={m.tt_delete_label_aria({ name: label.name })}
                        onClick={(event) => {
                          deleteFocusRef.current = event.currentTarget;
                          setPendingDeleteLabel(label);
                        }}
                      >
                        {m.delete()}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {draft.conflict && (
          <Alert aria-live="polite">
            {m.tt_json_conflict()}
            <JsonExample
              summaryLabel={m.tt_json_current()}
              json={JSON.stringify({ labels }, null, 2)}
            />
            <Button variant="outline" onClick={draft.reconcile}>
              {m.tt_json_keep_draft()}
            </Button>
          </Alert>
        )}
        <RawJsonEditor
          disabled={saving}
          applyDisabled={draft.conflict}
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
          <JsonExample summaryLabel={m.tt_example_labels_json()} json={EXAMPLE_LABELS_JSON} />
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
        isOpen={pendingJson !== null}
        title={m.tt_json_confirm()}
        message={m.tt_json_removals({
          remove: labels.filter((item) => !pendingJson?.some((next) => next.id === item.id)).length,
          add: pendingJson?.filter((item) => !labels.some((old) => old.id === item.id)).length ?? 0,
          change:
            pendingJson?.filter((item) =>
              labels.some(
                (old) => old.id === item.id && JSON.stringify(old) !== JSON.stringify(item),
              ),
            ).length ?? 0,
        })}
        onConfirm={() => {
          if (pendingJson) {
            setPendingJson(null);
            void saveJson(pendingJson, true);
          }
        }}
        onCancel={() => setPendingJson(null)}
      />
      <ConfirmationDialog
        confirmDisabled={saving}
        finalFocus={deleteFocusRef}
        isOpen={pendingDeleteLabel !== null}
        title={m.tt_delete_label_title()}
        message={
          pendingDeleteLabel ? m.tt_delete_item_message({ name: pendingDeleteLabel.name }) : ""
        }
        confirmLabel={m.delete()}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteLabel(null)}
      />
    </div>
  );
}
