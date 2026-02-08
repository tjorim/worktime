import type { ReactNode } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

type RawJsonEditorProps = {
  label: string;
  value: string;
  formatHint: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  onApply: () => void;
  className?: string;
  children?: ReactNode;
};

export function RawJsonEditor({
  label,
  value,
  formatHint,
  onChange,
  onCopy,
  onApply,
  className,
  children,
}: RawJsonEditorProps) {
  return (
    <details className={className}>
      <summary className="small text-muted">Raw {label.toLowerCase()} JSON (import/export)</summary>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 my-2">
        <div className="fw-semibold">{label} JSON</div>
        <div className="d-flex flex-wrap gap-2">
          <Button size="sm" variant="outline-secondary" onClick={onCopy}>
            Copy {label} JSON
          </Button>
          <Button size="sm" variant="outline-primary" onClick={onApply}>
            Apply {label} JSON
          </Button>
        </div>
      </div>
      <Form.Control
        as="textarea"
        rows={8}
        className="textarea-mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} JSON`}
      />
      <div className="small text-muted mt-2">
        Format: <code>{formatHint}</code>
      </div>
      {children}
    </details>
  );
}
