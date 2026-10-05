import { ClipboardCheck as ClipboardCheckIcon, FileText as FileTextIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { JsonExample, RawJsonEditor } from "./RawJsonEditor";
import { buildLabelNameMap, type Label } from "@/lib/timeTracking/constants";
import { TemplateModal, type TemplateForm } from "./TemplateModal";
import { isValidRange, isValidTimeString } from "@/lib/timeTracking/timeUtils";
import type { TimeTrackingTemplate } from "@/lib/timeTracking/types";
import * as m from "@/paraglide/messages.js";

type TemplatesPanelProps = {
  labels: Label[];
  templates: TimeTrackingTemplate[];
  onAddTemplate: (payload: Omit<TimeTrackingTemplate, "id">) => void;
  onUpdateTemplate: (payload: { id: string; template: Omit<TimeTrackingTemplate, "id"> }) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplates: (templates: TimeTrackingTemplate[]) => void;
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
  onUpdateTemplates,
}: TemplatesPanelProps) {
  const [error, setError] = useState("");
  const toast = useToast();
  const [templatesJson, setTemplatesJson] = useState(JSON.stringify({ templates }, null, 2));
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<TimeTrackingTemplate | null>(
    null,
  );
  const [modalInitialValue, setModalInitialValue] = useState<TemplateForm>({
    text: "",
    label: labels[0]?.id ?? "",
    start: "",
    stop: "",
  });

  const resetModalInitialValue = useCallback(
    () =>
      setModalInitialValue({
        text: "",
        label: labels[0]?.id ?? "",
        start: "",
        stop: "",
      }),
    [labels],
  );

  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);

  // Re-sync the raw JSON editor whenever `templates` changes externally, as a
  // same-render response rather than a follow-up effect. The editor still
  // owns its value the rest of the time (see the onChange handler below).
  const [prevTemplates, setPrevTemplates] = useState(templates);
  if (prevTemplates !== templates) {
    setPrevTemplates(templates);
    setTemplatesJson(JSON.stringify({ templates }, null, 2));
  }

  const [prevModalMode, setPrevModalMode] = useState(modalMode);
  if (prevModalMode !== modalMode) {
    setPrevModalMode(modalMode);
    if (modalMode === null) {
      resetModalInitialValue();
    }
  }

  const handleCopy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(JSON.stringify({ templates }, null, 2));
      toast.showSuccess(m.tt_copied_templates());
    } catch {
      setError(m.tt_copy_failed_msg());
    }
  };

  const handleApplyJson = () => {
    setError("");

    try {
      const parsed = JSON.parse(templatesJson);
      if (!validateTemplatesImportPayload(parsed)) {
        setError(m.tt_invalid_templates_structure());
        return;
      }

      onUpdateTemplates(sanitizeTemplates(parsed.templates ?? []));
      toast.showSuccess(m.tt_templates_updated());
    } catch {
      setError(m.tt_invalid_templates_format());
    }
  };

  const handleEdit = (template: TimeTrackingTemplate) => {
    setError("");
    setEditTemplateId(template.id);
    setModalInitialValue({
      text: template.text,
      label: template.label,
      start: template.start,
      stop: template.stop,
    });
    setModalMode("edit");
  };

  const handleSave = (templateForm: TemplateForm) => {
    setError("");
    if (!templateForm.text || !templateForm.start || !templateForm.stop) {
      setError(m.tt_fill_template_fields());
      return;
    }
    if (!templateForm.label) {
      setError(m.tt_error_configure_label());
      return;
    }
    if (!labels.some((l) => l.id === templateForm.label)) {
      setError(m.tt_label_not_found());
      return;
    }
    if (!isValidRange(templateForm.start, templateForm.stop)) {
      setError(m.tt_template_stop_after_start());
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
      toast.showSuccess(m.tt_template_updated());
    } else {
      onAddTemplate(templatePayload);
      toast.showSuccess(m.tt_template_added());
    }
    resetModalInitialValue();
    setEditTemplateId(null);
    setModalMode(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteTemplate) {
      return;
    }
    onDeleteTemplate(pendingDeleteTemplate.id);
    toast.showSuccess(m.tt_template_deleted());
    setPendingDeleteTemplate(null);
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
          <Icon icon={ClipboardCheckIcon} className="mr-2" />
          {m.tt_templates_heading()}
        </h5>
        <Button
          size="sm"
          onClick={() => {
            setError("");
            resetModalInitialValue();
            setEditTemplateId(null);
            setModalMode("create");
          }}
        >
          {m.tt_add_template_btn()}
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {templates.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted">
            <EmptyState
              icon={FileTextIcon}
              title={m.tt_no_templates_title()}
              description={m.tt_no_templates_desc()}
              ctaButton={{
                label: m.tt_add_first_template(),
                onClick: () => {
                  setError("");
                  resetModalInitialValue();
                  setEditTemplateId(null);
                  setModalMode("create");
                },
              }}
            />
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {templates.map((template) => (
              <div key={template.id} className="flex flex-wrap gap-2 px-3 py-2">
                <span className="mr-auto">
                  {template.text} ({template.start}-{template.stop}) [
                  {labelNameById[template.label] ?? m.tt_unknown_label()}]
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={m.edit_with_name({ name: template.text })}
                  onClick={() => handleEdit(template)}
                >
                  {m.edit()}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  aria-label={m.delete_with_name({ name: template.text })}
                  onClick={() => setPendingDeleteTemplate(template)}
                >
                  {m.delete()}
                </Button>
              </div>
            ))}
          </div>
        )}

        <RawJsonEditor
          summaryLabel={m.tt_raw_json_summary({ label: m.tt_templates_heading().toLowerCase() })}
          headingLabel={m.tt_json_heading({ label: m.tt_templates_heading() })}
          copyButtonLabel={m.tt_copy_json({ label: m.tt_templates_heading() })}
          applyButtonLabel={m.tt_apply_json({ label: m.tt_templates_heading() })}
          ariaLabel={m.tt_json_aria({ label: m.tt_templates_heading() })}
          formatLabel={m.tt_format()}
          value={templatesJson}
          formatHint={`{"templates":[{"id":"template-1","text":"Support","label":"label-1","start":"09:00","stop":"11:00"}]}`}
          onChange={setTemplatesJson}
          onCopy={handleCopy}
          onApply={handleApplyJson}
        >
          <JsonExample summaryLabel={m.tt_example_templates_json()} json={EXAMPLE_TEMPLATES_JSON} />
        </RawJsonEditor>
      </div>

      <TemplateModal
        key={`${modalMode ?? "closed"}-${editTemplateId ?? "new"}`}
        show={modalMode !== null}
        title={modalMode === "edit" ? m.tt_edit_template_title() : m.tt_add_template_title()}
        submitLabel={modalMode === "edit" ? m.tt_save_changes() : m.tt_save_template()}
        labels={labels}
        initialValue={modalInitialValue}
        error={error}
        onClose={() => {
          setError("");
          resetModalInitialValue();
          setEditTemplateId(null);
          setModalMode(null);
        }}
        onSubmit={handleSave}
      />

      <ConfirmationDialog
        isOpen={pendingDeleteTemplate !== null}
        title={m.tt_delete_template_title()}
        message={
          pendingDeleteTemplate
            ? m.tt_delete_item_message({ name: pendingDeleteTemplate.text })
            : ""
        }
        confirmLabel={m.delete()}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteTemplate(null)}
      />
    </div>
  );
}
