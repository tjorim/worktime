import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";

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
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form
          id="labelForm"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Form.Group controlId="timeTrackingLabelName" className="mb-3">
            <Form.Label>Label name</Form.Label>
            <Form.Control
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder="e.g., Support"
              aria-required="true"
              required
            />
          </Form.Group>
          <Form.Group controlId="timeTrackingLabelColor">
            <Form.Label>Label color</Form.Label>
            <div className="d-flex gap-2 align-items-center">
              <Form.Control
                type="color"
                value={value.color}
                onChange={(event) => onChange({ ...value, color: event.target.value })}
                title="Select label color"
                className="form-control-color"
                aria-required="true"
                required
              />
              <Form.Control
                value={value.color}
                onChange={(event) => onChange({ ...value, color: event.target.value })}
                placeholder="#3B82F6"
                aria-label="Label color (hex)"
                aria-required="true"
                required
              />
            </div>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="labelForm" variant="primary">
          {submitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
