import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Hint } from "@/components/ui/tooltip";
import * as m from "@/paraglide/messages.js";

type LabelForm = {
  name: string;
  color: string;
};

type LabelModalProps = {
  show: boolean;
  title: string;
  submitLabel: string;
  value: LabelForm;
  onChange: (value: LabelForm) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function LabelModal({
  show,
  title,
  submitLabel,
  value,
  onChange,
  onClose,
  onSubmit,
}: LabelModalProps) {
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
        <div className="min-h-0 overflow-y-auto p-4">
          <form
            id="labelForm"
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <Field>
              <FieldLabel htmlFor="labelName">{m.form_label_name()}</FieldLabel>
              <Input
                id="labelName"
                value={value.name}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
                placeholder={m.form_label_name_placeholder()}
                aria-required="true"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="labelColor">{m.form_label_color()}</FieldLabel>
              <div className="flex items-center gap-2">
                <Hint
                  placement="top"
                  content={<div id="label-color-picker">{m.tt_select_label_color()}</div>}
                >
                  <Input
                    id="labelColor"
                    type="color"
                    value={value.color}
                    onChange={(event) => onChange({ ...value, color: event.target.value })}
                    className="w-12 shrink-0 p-1"
                    aria-required="true"
                    required
                  />
                </Hint>
                <Input
                  value={value.color}
                  onChange={(event) => onChange({ ...value, color: event.target.value })}
                  placeholder="#3B82F6"
                  aria-label={m.form_label_color_hex_aria()}
                  aria-required="true"
                  required
                />
              </div>
            </Field>
          </form>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {m.cancel()}
          </Button>
          <Button type="submit" form="labelForm">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
