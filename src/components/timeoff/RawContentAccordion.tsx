import { useId } from "react";
import Accordion from "react-bootstrap/Accordion";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

type RawContentAccordionProps = {
  rawText: string;
  error?: string;
  isDirty: boolean;
  onChangeRawText: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function RawContentAccordion({
  rawText,
  error,
  isDirty,
  onChangeRawText,
  onApply,
  onReset,
}: RawContentAccordionProps) {
  const errorId = useId();

  return (
    <Accordion className="mb-3">
      <Accordion.Item eventKey="raw-content">
        <Accordion.Header>Raw .hday content</Accordion.Header>
        <Accordion.Body>
          <p className="text-muted">
            Paste your <code>.hday</code> content below (or load a file), click <strong>Apply</strong>
            , then export if needed. Flags: <code>a</code>=half AM, <code>p</code>=half PM,{" "}
            <code>b</code>=business, <code>e</code>=weekend, <code>h</code>=birthday,{" "}
            <code>i</code>=ill, <code>k</code>=in, <code>s</code>=course, <code>u</code>=other,{" "}
            <code>w</code>=onsite, <code>n</code>=no fly, <code>f</code>=can fly; weekly:{" "}
            <code>d1-d7</code> (Mon-Sun) with flags after (e.g., <code>d3pb</code>).
          </p>
          <Form.Group controlId="hdayText">
            <Form.Label>Raw .hday content</Form.Label>
            <Form.Control
              as="textarea"
              rows={8}
              value={rawText}
              onChange={(event) => onChangeRawText(event.target.value)}
              placeholder={
                "Example:\n2024/12/23-2025/01/05 # Winter break\np2024/07/17-2024/07/17\nd3pb # Wednesday AM business"
              }
              className="textarea-mono"
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <div className="text-danger small mt-2" role="alert" id={errorId}>
                {error}
              </div>
            )}
          </Form.Group>
          <div className="mt-3 d-flex flex-wrap gap-2">
            <Button variant="primary" onClick={onApply}>
              Apply raw content
            </Button>
            <Button variant="outline-secondary" onClick={onReset} disabled={!isDirty}>
              Reset
            </Button>
          </div>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}
