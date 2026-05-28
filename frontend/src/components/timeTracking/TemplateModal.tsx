import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ReactSelect from "react-select";
import { useForm, useStore } from "@tanstack/react-form";
import type { TimeTrackingLabel } from "./constants";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";
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
  labels: TimeTrackingLabel[];
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

  const labelValue = useStore(form.store, (state) => state.values.label);
  const selectedLabelOption = useSelectedLabelOption(labels, labelValue);
  const isSubmitDisabled =
    isLabelSelectionDisabled || !labelValue || selectedLabelOption === null;

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
            void form.handleSubmit();
          }}
        >
          {error && (
            <Alert variant="danger" aria-live="polite" className="mb-3">
              {error}
            </Alert>
          )}
          <form.Field name="text">
            {(field) => (
              <Form.Group controlId="templateName" className="mb-3">
                <Form.Label>{m.form_task_name()}</Form.Label>
                <Form.Control
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={m.form_task_name_placeholder()}
                  aria-required="true"
                  required
                />
              </Form.Group>
            )}
          </form.Field>
          <form.Field name="label">
            {(field) => (
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
                  onChange={(selected) => field.handleChange(selected?.value ?? "")}
                  classNames={bootstrapSelectClassNames}
                />
                {isLabelSelectionDisabled ? (
                  <Form.Text id="templateLabelHelp" muted>
                    {m.tt_add_labels_first_help()}
                  </Form.Text>
                ) : null}
              </Form.Group>
            )}
          </form.Field>
          <div className="d-flex gap-3">
            <form.Field name="start">
              {(field) => (
                <Form.Group controlId="templateStart" className="flex-fill">
                  <Form.Label>{m.form_start()}</Form.Label>
                  <Form.Control
                    type="time"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-required="true"
                    required
                  />
                </Form.Group>
              )}
            </form.Field>
            <form.Field name="stop">
              {(field) => (
                <Form.Group controlId="templateStop" className="flex-fill">
                  <Form.Label>{m.form_stop()}</Form.Label>
                  <Form.Control
                    type="time"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-required="true"
                    required
                  />
                </Form.Group>
              )}
            </form.Field>
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
