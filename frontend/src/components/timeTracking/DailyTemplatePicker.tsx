import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import ReactSelect from "react-select";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";
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
    <Form.Group className="mb-2" controlId="timeTrackerTemplate">
      <Form.Label className="visually-hidden">{m.tt_template()}</Form.Label>
      <InputGroup>
        <ReactSelect<TemplateOption>
          unstyled
          isClearable
          isSearchable
          inputId="timeTrackerTemplate"
          placeholder={m.tt_choose_template()}
          options={options}
          value={value}
          onChange={(selected) => onChange(selected?.value ?? "")}
          classNames={bootstrapSelectClassNames}
          className="flex-fill"
        />
        <Button variant="outline-secondary" onClick={onApply}>
          {m.tt_use_template()}
        </Button>
      </InputGroup>
    </Form.Group>
  );
}
