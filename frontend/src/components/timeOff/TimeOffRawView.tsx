import { useId } from "react";
import Accordion from "react-bootstrap/Accordion";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import * as m from "../../paraglide/messages.js";

type TimeOffRawViewProps = {
  rawText: string;
  error?: string;
  skippedLines?: string[];
  isDirty: boolean;
  onChangeRawText: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function TimeOffRawView({
  rawText,
  error,
  skippedLines,
  isDirty,
  onChangeRawText,
  onApply,
  onReset,
}: TimeOffRawViewProps) {
  const errorId = useId();
  const skippedId = useId();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
    } catch {
      alert(m.timeoff_copy_raw_failed());
    }
  };

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
          <p className="text-muted">{m.timeoff_raw_help()}</p>
          <Form.Group controlId="hdayText" className="mb-3">
            <Form.Label className="visually-hidden">{m.timeoff_raw_content_label()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={20}
              value={rawText}
              onChange={(event) => onChangeRawText(event.target.value)}
              placeholder={m.timeoff_raw_placeholder()}
              className="textarea-mono"
              aria-describedby={
              [error ? errorId : null, skippedLines?.length ? skippedId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
              isInvalid={!!error}
            />
            {error && (
              <Form.Control.Feedback type="invalid" id={errorId} role="alert">
                {error}
              </Form.Control.Feedback>
            )}
            {skippedLines && skippedLines.length > 0 && (
              <div id={skippedId} className="mt-2 text-warning-emphasis" role="alert">
                <small><strong>{m.timeoff_hday_skipped_lines_heading()}</strong></small>
                <ul className="mb-0 font-monospace small">
                  {skippedLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </Form.Group>
          <div className="d-flex flex-wrap gap-2">
            <Button
              variant="outline-secondary"
              onClick={() => {
                void handleCopy();
              }}
              disabled={!rawText}
              aria-label={m.timeoff_copy_raw_aria()}
              title={m.timeoff_copy_raw_aria()}
            >
              <i className="bi bi-clipboard me-1" aria-hidden="true"></i>
              {m.timeoff_copy_raw()}
            </Button>
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
