import { useId } from "react";
import Accordion from "react-bootstrap/Accordion";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import * as m from "../../paraglide/messages.js";

type TimeOffRawViewProps = {
  rawText: string;
  error?: string;
  isDirty: boolean;
  onChangeRawText: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function TimeOffRawView({
  rawText,
  error,
  isDirty,
  onChangeRawText,
  onApply,
  onReset,
}: TimeOffRawViewProps) {
  const errorId = useId();

  return (
    <Accordion>
      <Accordion.Item eventKey="raw-editor">
        <Accordion.Header>
          <i className="bi bi-code-square me-2" aria-hidden="true"></i>
          {m.timeoff_raw_editor_heading()}
          {isDirty && (
            <span className="badge bg-warning text-dark ms-2" title={m.timeoff_unsaved_changes()}>
              •
            </span>
          )}
        </Accordion.Header>
        <Accordion.Body>
          <p className="text-muted">
            {m.timeoff_raw_help()}
          </p>
          <Form.Group controlId="hdayText" className="mb-3">
            <Form.Label className="visually-hidden">{m.timeoff_raw_content_label()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={20}
              value={rawText}
              onChange={(event) => onChangeRawText(event.target.value)}
              placeholder={
                m.timeoff_raw_placeholder()
              }
              className="textarea-mono"
              aria-describedby={error ? errorId : undefined}
              isInvalid={!!error}
            />
            {error && (
              <Form.Control.Feedback type="invalid" id={errorId} role="alert">
                {error}
              </Form.Control.Feedback>
            )}
          </Form.Group>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="primary" onClick={onApply}>
              <i className="bi bi-check-circle me-1" aria-hidden="true"></i>
              {m.timeoff_apply_raw()}
            </Button>
            <Button variant="outline-secondary" onClick={onReset} disabled={!isDirty}>
              <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>
              {m.timeoff_reset_btn()}
            </Button>
          </div>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}
