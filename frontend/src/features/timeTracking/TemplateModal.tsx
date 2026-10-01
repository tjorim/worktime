import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DialogSelect } from "@/components/shared/DialogSelect";
import { useForm, useSelector } from "@tanstack/react-form";
import type { Label } from "@/lib/timeTracking/constants";
import { selectClassNames } from "@/utils/reactSelectStyles";
import { useSelectedLabelOption, type LabelOption } from "@/hooks/useSelectedLabelOption";
import * as m from "@/paraglide/messages.js";

export type TemplateForm = {
  text: string;
  label: string;
  start: string;
  stop: string;
};

type TemplateModalProps = {
  show: boolean;
  title: string;
  submitLabel: string;
  labels: Label[];
  initialValue: TemplateForm;
  error?: string;
  onClose: () => void;
  onSubmit: (value: TemplateForm) => void;
};

export function TemplateModal({
  show,
  title,
  submitLabel,
  labels,
  initialValue,
  error,
  onClose,
  onSubmit,
}: TemplateModalProps) {
  const isLabelSelectionDisabled = labels.length === 0;
  const form = useForm({
    defaultValues: initialValue,
    onSubmit: ({ value }) => onSubmit(value),
  });

  const labelValue = useSelector(form.atom, (state) => state.values.label);
  const selectedLabelOption = useSelectedLabelOption(labels, labelValue);
  const isSubmitDisabled = isLabelSelectionDisabled || !labelValue || selectedLabelOption === null;

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          <form
            id="templateForm"
            className="tw:flex tw:flex-col tw:gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (isSubmitDisabled) {
                return;
              }
              void form.handleSubmit();
            }}
          >
            {error && (
              <Alert variant="destructive" aria-live="polite">
                {error}
              </Alert>
            )}
            <form.Field name="text">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="templateName">{m.form_task_name()}</FieldLabel>
                  <Input
                    id="templateName"
                    value={field.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={m.form_task_name_placeholder()}
                    aria-required="true"
                    required
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="label">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="templateLabel">{m.form_label()}</FieldLabel>
                  <DialogSelect<LabelOption>
                    unstyled
                    isClearable
                    isSearchable
                    inputId="templateLabel"
                    isDisabled={isLabelSelectionDisabled}
                    placeholder={
                      isLabelSelectionDisabled ? m.tt_add_labels_first() : m.tt_select_label()
                    }
                    aria-describedby={isLabelSelectionDisabled ? "templateLabelHelp" : undefined}
                    options={labels.map((l) => ({ value: l.id, label: l.name }))}
                    value={selectedLabelOption}
                    onChange={(selected) => field.handleChange(selected?.value ?? "")}
                    classNames={selectClassNames}
                  />
                  {isLabelSelectionDisabled ? (
                    <FieldDescription id="templateLabelHelp">
                      {m.tt_add_labels_first_help()}
                    </FieldDescription>
                  ) : null}
                </Field>
              )}
            </form.Field>
            <div className="tw:flex tw:gap-3">
              <form.Field name="start">
                {(field) => (
                  <Field className="tw:flex-1">
                    <FieldLabel htmlFor="templateStart">{m.form_start()}</FieldLabel>
                    <Input
                      id="templateStart"
                      type="time"
                      value={field.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-required="true"
                      required
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="stop">
                {(field) => (
                  <Field className="tw:flex-1">
                    <FieldLabel htmlFor="templateStop">{m.form_stop()}</FieldLabel>
                    <Input
                      id="templateStop"
                      type="time"
                      value={field.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-required="true"
                      required
                    />
                  </Field>
                )}
              </form.Field>
            </div>
          </form>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {m.cancel()}
          </Button>
          <Button type="submit" form="templateForm" disabled={isSubmitDisabled}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
