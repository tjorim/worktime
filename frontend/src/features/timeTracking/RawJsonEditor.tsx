import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
      <summary className="text-sm text-muted-foreground">{summaryLabel}</summary>
      <div className="my-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{headingLabel}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onCopy}>
            {copyButtonLabel}
          </Button>
          <Button size="sm" onClick={onApply}>
            {applyButtonLabel}
          </Button>
        </div>
      </div>
      <Textarea
        rows={8}
        className="field-sizing-fixed font-mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
      <div className="mt-2 text-sm text-muted-foreground">
        {formatLabel}: <code>{formatHint}</code>
      </div>
      {children}
    </details>
  );
}

/** Collapsible read-only JSON sample shown under a raw editor. */
export function JsonExample({ summaryLabel, json }: { summaryLabel: string; json: string }) {
  return (
    <details className="mt-3">
      <summary className="text-sm text-muted-foreground">{summaryLabel}</summary>
      <pre className="mt-2 mb-0 overflow-x-auto rounded-lg border border-border bg-muted p-2 font-mono text-sm text-foreground">
        <code>{json}</code>
      </pre>
    </details>
  );
}
