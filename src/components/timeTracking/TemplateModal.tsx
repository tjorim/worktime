import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ReactSelect from "react-select";
import type { TimeTrackingLabel } from "./labelTypes";
import { bootstrapSelectClassNames } from "../../utils/reactSelectStyles";
import { useSelectedLabelOption, type LabelOption } from "../../hooks/useSelectedLabelOption";
import * as m from "../../paraglide/messages.js";

type TemplateForm = {
  text: string;
  label: string;
  start: string;
  stop: string;
};

type TemplateModalProps = {
  show: boolean;
  title: string;
  submitLabel: string;
  labels: TimeTrackingLabel[];
  value: TemplateForm;
  onChange: (value: TemplateForm) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function TemplateModal({
  show,
  title,
  submitLabel,
  labels,
  value,
  onChange,
  onClose,
  onSubmit,
}: TemplateModalProps) {
  const isLabelSelectionDisabled = labels.length === 0;
  const selectedLabelOption = useSelectedLabelOption(labels, value.label);
  const isSubmitDisabled = isLabelSelectionDisabled || !value.label || selectedLabelOption === null;

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form
          id="templateForm"
          onSubmit={(event) => {
            event.preventDefault();
            if (isSubmitDisabled) {
              return;
            }
            onSubmit();
          }}
        >
          <Form.Group controlId="templateName" className="mb-3">
            <Form.Label>{m.form_task_name()}</Form.Label>
            <Form.Control
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
              placeholder={m.form_task_name_placeholder()}
              aria-required="true"
              required
            />
          </Form.Group>
          <Form.Group controlId="templateLabel" className="mb-3">
            <Form.Label>{m.form_label()}</Form.Label>
            <ReactSelect<LabelOption>
              unstyled
              isClearable
              isSearchable
              inputId="templateLabel"
              isDisabled={isLabelSelectionDisabled}
              placeholder={isLabelSelectionDisabled ? m.tt_add_labels_first() : m.tt_select_label()}
              aria-describedby={isLabelSelectionDisabled ? "templateLabelHelp" : undefined}
              options={labels.map((l) => ({ value: l.id, label: l.name }))}
              value={selectedLabelOption}
              onChange={(selected) => onChange({ ...value, label: selected?.value ?? "" })}
              classNames={bootstrapSelectClassNames}
            />
            {isLabelSelectionDisabled ? (
              <Form.Text id="templateLabelHelp" muted>
                {m.tt_add_labels_first_help()}
              </Form.Text>
            ) : null}
          </Form.Group>
          <div className="d-flex gap-3">
            <Form.Group controlId="templateStart" className="flex-fill">
              <Form.Label>{m.form_start()}</Form.Label>
              <Form.Control
                type="time"
                value={value.start}
                onChange={(event) => onChange({ ...value, start: event.target.value })}
                aria-required="true"
                required
              />
            </Form.Group>
            <Form.Group controlId="templateStop" className="flex-fill">
              <Form.Label>{m.form_stop()}</Form.Label>
              <Form.Control
                type="time"
                value={value.stop}
                onChange={(event) => onChange({ ...value, stop: event.target.value })}
                aria-required="true"
                required
              />
            </Form.Group>
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {m.cancel()}
        </Button>
        <Button type="submit" form="templateForm" variant="primary" disabled={isSubmitDisabled}>
          {submitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
