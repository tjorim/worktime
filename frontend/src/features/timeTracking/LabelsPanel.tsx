import { useJsonDraft } from "@/features/timeTracking/useJsonDraft";
import { getErrorMessage, type ErrorCodeMessages } from "@/utils/apiError";
import { TagsIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
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
import type { GanttTask } from "@/types/gantt";
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
  ganttTasks: Pick<GanttTask, "label">[];
  onUpdateLabels: (labels: Label[], confirmedRemoval?: boolean) => void | Promise<void>;
  /** Move everything off a label onto another, then delete the label. */
  onReassignAndDeleteLabel: (labelId: string, replacementId: string) => Promise<void>;
};

type LabelUsage = { templates: number; tasks: number; ganttTasks: number };

// A reassignment that stopped part-way reports through the settings replacement code.
const REASSIGN_ERROR_MESSAGES: ErrorCodeMessages = {
  SETTINGS_PARTIAL: () => m.tt_label_reassign_failed(),
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

export function LabelsPanel({
  labels,
  templates,
  tasks,
  ganttTasks,
  onUpdateLabels,
  onReassignAndDeleteLabel,
}: LabelsPanelProps) {
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
  const [replacementId, setReplacementId] = useState("");
  const [labelForm, setLabelForm] = useState<LabelFormState>({
    name: "",
    color: labels[0]?.color ?? "#3B82F6",
  });
  const pluralRules = useMemo(() => new Intl.PluralRules(getLocale()), []);
  const listFormat = useMemo(
    () => new Intl.ListFormat(getLocale(), { style: "long", type: "conjunction" }),
    [],
  );

  const resetForm = () =>
    setLabelForm({
      name: "",
      color: labels[0]?.color ?? "#3B82F6",
    });

  const usageByLabelId = useMemo(() => {
    const map: Record<string, LabelUsage> = {};
    for (const label of labels) {
      map[label.id] = { templates: 0, tasks: 0, ganttTasks: 0 };
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
    for (const task of ganttTasks) {
      const entry = task.label ? map[task.label] : undefined;
      if (entry) {
        entry.ganttTasks++;
      }
    }
    return map;
  }, [labels, templates, tasks, ganttTasks]);

  const describeUsage = (usage: LabelUsage | undefined): string => {
    const parts: string[] = [];
    if (usage?.templates) {
      parts.push(
        pluralRules.select(usage.templates) === "one"
          ? m.tt_template_count_one({ count: usage.templates })
          : m.tt_template_count_other({ count: usage.templates }),
      );
    }
    if (usage?.tasks) {
      parts.push(
        pluralRules.select(usage.tasks) === "one"
          ? m.tt_task_count_one({ count: usage.tasks })
          : m.tt_task_count_other({ count: usage.tasks }),
      );
    }
    if (usage?.ganttTasks) {
      parts.push(
        pluralRules.select(usage.ganttTasks) === "one"
          ? m.tt_gantt_task_count_one({ count: usage.ganttTasks })
          : m.tt_gantt_task_count_other({ count: usage.ganttTasks }),
      );
    }
    return listFormat.format(parts);
  };

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
          (usageByLabelId[label.id]?.tasks ||
            usageByLabelId[label.id]?.templates ||
            usageByLabelId[label.id]?.ganttTasks),
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

  const closeDeleteDialog = () => {
    setPendingDeleteLabel(null);
    setReplacementId("");
  };

  const handleConfirmDelete = async () => {
    if (saving || !pendingDeleteLabel) {
      return;
    }
    const label = pendingDeleteLabel;
    const usage = describeUsage(usageByLabelId[label.id]);
    const replacement = usage ? labels.find((item) => item.id === replacementId) : undefined;
    if (usage && !replacement) {
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (replacement) {
        await onReassignAndDeleteLabel(label.id, replacement.id);
      } else {
        await onUpdateLabels(
          labels.filter((item) => item.id !== label.id),
          true,
        );
      }
    } catch (error) {
      setError(
        replacement
          ? getErrorMessage(error, m.tt_label_reassign_failed(), REASSIGN_ERROR_MESSAGES)
          : getErrorMessage(error, m.tt_json_save_failed()),
      );
      closeDeleteDialog();
      return;
    } finally {
      setSaving(false);
    }
    deleteFocusRef.current = addLabelRef.current;
    toast.showSuccess(
      replacement
        ? m.tt_label_reassigned_deleted({ usage, target: replacement.name, name: label.name })
        : m.tt_label_deleted(),
    );
    if (editLabelId === label.id) {
      setEditLabelId(null);
      resetForm();
      setModalMode(null);
    }
    closeDeleteDialog();
  };

  const deleteUsage = pendingDeleteLabel
    ? describeUsage(usageByLabelId[pendingDeleteLabel.id])
    : "";

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
              const usageText = describeUsage(usageByLabelId[label.id]);
              const isInUse = usageText !== "";
              const canReassign = labels.length > 1;
              return (
                <div key={label.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <LabelChip color={label.color}>{label.name}</LabelChip>
                  {isInUse && (
                    <span className="text-sm text-muted-foreground">
                      {m.tt_label_used_by({ context: usageText })}
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
                    {isInUse && !canReassign ? (
                      <Hint
                        content={
                          <div id={`delete-label-${label.id}`}>
                            {m.tt_label_in_use_tooltip({ usage: usageText })}
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
                          setReplacementId("");
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
        confirmDisabled={saving || (deleteUsage !== "" && replacementId === "")}
        finalFocus={deleteFocusRef}
        isOpen={pendingDeleteLabel !== null}
        title={m.tt_delete_label_title()}
        message={
          pendingDeleteLabel ? (
            deleteUsage ? (
              <div className="flex flex-col gap-3">
                <p className="mb-0">
                  {m.tt_reassign_label_message({
                    name: pendingDeleteLabel.name,
                    usage: deleteUsage,
                  })}
                </p>
                <Field>
                  <FieldLabel htmlFor="reassignLabelTarget">
                    {m.tt_reassign_label_field()}
                  </FieldLabel>
                  <NativeSelect
                    id="reassignLabelTarget"
                    className="h-9 w-full"
                    value={replacementId}
                    onChange={(event) => setReplacementId(event.target.value)}
                  >
                    <option value="">{m.tt_select_label()}</option>
                    {labels
                      .filter((item) => item.id !== pendingDeleteLabel.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
              </div>
            ) : (
              m.tt_delete_item_message({ name: pendingDeleteLabel.name })
            )
          ) : (
            ""
          )
        }
        confirmLabel={deleteUsage ? m.tt_reassign_label_confirm() : m.delete()}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
}
