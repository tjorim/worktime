import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { TIME_TRACKING_TAGS, type TimeTrackingTag } from "./constants";

type TemplateForm = {
  text: string;
  tag: TimeTrackingTag;
  start: string;
  stop: string;
};

type TemplateModalProps = {
  show: boolean;
  title: string;
  submitLabel: string;
  value: TemplateForm;
  onChange: (value: TemplateForm) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function TemplateModal({
  show,
  title,
  submitLabel,
  value,
  onChange,
  onClose,
  onSubmit,
}: TemplateModalProps) {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={(event) => event.preventDefault()}>
          <Form.Group controlId="templateName" className="mb-3">
            <Form.Label>Task name</Form.Label>
            <Form.Control
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
              aria-required="true"
            />
          </Form.Group>
          <Form.Group controlId="templateTag" className="mb-3">
            <Form.Label>Tag</Form.Label>
            <Form.Select
              value={value.tag}
              onChange={(event) =>
                onChange({ ...value, tag: event.target.value as TimeTrackingTag })
              }
            >
              {TIME_TRACKING_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag.replaceAll("-", " ")}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <div className="d-flex gap-3">
            <Form.Group controlId="templateStart" className="flex-fill">
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="time"
                value={value.start}
                onChange={(event) => onChange({ ...value, start: event.target.value })}
                aria-required="true"
              />
            </Form.Group>
            <Form.Group controlId="templateStop" className="flex-fill">
              <Form.Label>Stop</Form.Label>
              <Form.Control
                type="time"
                value={value.stop}
                onChange={(event) => onChange({ ...value, stop: event.target.value })}
                aria-required="true"
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
