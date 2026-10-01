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
      <summary className="tw:text-sm tw:text-muted-foreground">{summaryLabel}</summary>
      <div className="tw:my-2 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
        <div className="tw:font-semibold">{headingLabel}</div>
        <div className="tw:flex tw:flex-wrap tw:gap-2">
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
        className="tw:field-sizing-fixed tw:font-mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
      <div className="tw:mt-2 tw:text-sm tw:text-muted-foreground">
        {formatLabel}: <code>{formatHint}</code>
      </div>
      {children}
    </details>
  );
}

/** Collapsible read-only JSON sample shown under a raw editor. */
export function JsonExample({ summaryLabel, json }: { summaryLabel: string; json: string }) {
  return (
    <details className="tw:mt-3">
      <summary className="tw:text-sm tw:text-muted-foreground">{summaryLabel}</summary>
      <pre className="tw:mt-2 tw:mb-0 tw:overflow-x-auto tw:rounded-lg tw:border tw:border-border tw:bg-muted tw:p-2 tw:font-mono tw:text-sm tw:text-foreground">
        <code>{json}</code>
      </pre>
    </details>
  );
}
