import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import type { TimeTrackingLabel } from "./constants";

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
            onSubmit();
          }}
        >
          <Form.Group controlId="templateName" className="mb-3">
            <Form.Label>Task name</Form.Label>
            <Form.Control
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
              aria-required="true"
              required
            />
          </Form.Group>
          <Form.Group controlId="templateLabel" className="mb-3">
            <Form.Label>Label</Form.Label>
            <Form.Select
              value={value.label}
              onChange={(event) => onChange({ ...value, label: event.target.value })}
              disabled={isLabelSelectionDisabled}
              aria-describedby={isLabelSelectionDisabled ? "templateLabelHelp" : undefined}
              aria-required="true"
              required
            >
              {isLabelSelectionDisabled ? (
                <option value="">Add labels first</option>
              ) : (
                <>
                  <option value="" disabled>
                    Select a label
                  </option>
                  {labels.map((label) => (
                    <option key={label.id} value={label.name}>
                      {label.name}
                    </option>
                  ))}
                </>
              )}
            </Form.Select>
            {isLabelSelectionDisabled ? (
              <Form.Text id="templateLabelHelp" muted>
                Add at least one label in Time Tracking Settings before creating templates.
              </Form.Text>
            ) : null}
          </Form.Group>
          <div className="d-flex gap-3">
            <Form.Group controlId="templateStart" className="flex-fill">
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="time"
                value={value.start}
                onChange={(event) => onChange({ ...value, start: event.target.value })}
                aria-required="true"
                required
              />
            </Form.Group>
            <Form.Group controlId="templateStop" className="flex-fill">
              <Form.Label>Stop</Form.Label>
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
          Cancel
        </Button>
        <Button type="submit" form="templateForm" variant="primary">
          {submitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
