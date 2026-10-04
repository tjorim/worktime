import ReactSelect from "react-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { selectClassNames } from "@/utils/reactSelectStyles";
import * as m from "@/paraglide/messages.js";

export type TemplateOption = { value: string; label: string };

interface DailyTemplatePickerProps {
  options: TemplateOption[];
  value: TemplateOption | null;
  onChange: (templateId: string) => void;
  onApply: () => void;
}

export function DailyTemplatePicker({
  options,
  value,
  onChange,
  onApply,
}: DailyTemplatePickerProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <Field className="mb-2">
      <FieldLabel htmlFor="timeTrackerTemplate" className="sr-only">
        {m.tt_template()}
      </FieldLabel>
      <div className="flex gap-2">
        <ReactSelect<TemplateOption>
          unstyled
          isClearable
          isSearchable
          inputId="timeTrackerTemplate"
          placeholder={m.tt_choose_template()}
          options={options}
          value={value}
          onChange={(selected) => onChange(selected?.value ?? "")}
          classNames={selectClassNames}
          className="min-w-0 flex-1"
        />
        <Button variant="outline" className="h-auto" onClick={onApply}>
          {m.tt_use_template()}
        </Button>
      </div>
    </Field>
  );
}
