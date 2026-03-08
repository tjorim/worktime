import type { ReactNode } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

type RawJsonEditorProps = {
  value: string;
  formatHint: string;
  summaryLabel: string;
  headingLabel: string;
  copyButtonLabel: string;
  applyButtonLabel: string;
  ariaLabel: string;
  formatLabel: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  onApply: () => void;
  className?: string;
  children?: ReactNode;
};

export function RawJsonEditor({
  value,
  formatHint,
  summaryLabel,
  headingLabel,
  copyButtonLabel,
  applyButtonLabel,
  ariaLabel,
  formatLabel,
  onChange,
  onCopy,
  onApply,
  className,
  children,
}: RawJsonEditorProps) {
  return (
    <details className={className}>
      <summary className="small text-muted">{summaryLabel}</summary>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 my-2">
        <div className="fw-semibold">{headingLabel}</div>
        <div className="d-flex flex-wrap gap-2">
          <Button size="sm" variant="outline-secondary" onClick={onCopy}>
            {copyButtonLabel}
          </Button>
          <Button size="sm" variant="outline-primary" onClick={onApply}>
            {applyButtonLabel}
          </Button>
        </div>
      </div>
      <Form.Control
        as="textarea"
        rows={8}
        className="textarea-mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
      <div className="small text-muted mt-2">
        {formatLabel}: <code>{formatHint}</code>
      </div>
      {children}
    </details>
  );
}
