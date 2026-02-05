import { useId } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";

type RawContentPanelProps = {
  rawText: string;
  error?: string;
  isDirty: boolean;
  onChangeRawText: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function RawContentPanel({
  rawText,
  error,
  isDirty,
  onChangeRawText,
  onApply,
  onReset,
}: RawContentPanelProps) {
  const errorId = useId();

  return (
    <Card>
      <Card.Header className="fw-semibold">
        <i className="bi bi-code-square me-2" aria-hidden="true"></i>
        Raw .hday content
      </Card.Header>
      <Card.Body>
        <p className="text-muted">
          Paste your <code>.hday</code> content below (or load a file), click <strong>Apply</strong>
          , then export if needed. Flags: <code>a</code>=half AM, <code>p</code>=half PM,{" "}
          <code>b</code>=business, <code>e</code>=weekend, <code>h</code>=birthday, <code>i</code>
          =ill, <code>k</code>=in, <code>s</code>=course, <code>u</code>=other, <code>w</code>
          =onsite, <code>n</code>=no fly, <code>f</code>=can fly; weekly: <code>d1-d7</code>{" "}
          (Mon-Sun) with flags after (e.g., <code>d3ab</code> for Wed AM business).
        </p>
        <Form.Group controlId="hdayText" className="mb-3">
          <Form.Label className="visually-hidden">Raw .hday content</Form.Label>
          <Form.Control
            as="textarea"
            rows={20}
            value={rawText}
            onChange={(event) => onChangeRawText(event.target.value)}
            placeholder={
              "Example:\n2024/12/23-2025/01/05 # Winter break\np2024/07/17-2024/07/17\nd3ab # Wednesday AM business"
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
            Apply raw content
          </Button>
          <Button variant="outline-secondary" onClick={onReset} disabled={!isDirty}>
            <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>
            Reset
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}
