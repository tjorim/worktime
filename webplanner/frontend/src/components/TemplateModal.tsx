import { Button, Form, Modal } from "react-bootstrap";

type TemplateForm = {
  text: string;
  tag: string;
  start: string;
  stop: string;
};

type Props = {
  show: boolean;
  title: string;
  submitLabel: string;
  value: TemplateForm;
  onChange: (value: TemplateForm) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const tags = [
  "Factory-Improvement",
  "Support",
  "Meeting",
  "NPI-DUV",
  "NPI-EUV",
  "Department-Improvement",
  "Training",
  "Lunch"
];

export function TemplateModal({
  show,
  title,
  submitLabel,
  value,
  onChange,
  onClose,
  onSubmit
}: Props) {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>Task name</Form.Label>
            <Form.Control
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Tag</Form.Label>
            <Form.Select
              value={value.tag}
              onChange={(event) => onChange({ ...value, tag: event.target.value })}
            >
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag.replace("-", " ")}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <div className="d-flex gap-3">
            <Form.Group className="flex-fill">
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="time"
                value={value.start}
                onChange={(event) => onChange({ ...value, start: event.target.value })}
              />
            </Form.Group>
            <Form.Group className="flex-fill">
              <Form.Label>Stop</Form.Label>
              <Form.Control
                type="time"
                value={value.stop}
                onChange={(event) => onChange({ ...value, stop: event.target.value })}
              />
            </Form.Group>
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSubmit}>
          {submitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
