import type { CSSProperties, ReactNode } from "react";
import { resolveLabelColors } from "./cssVars";

/** A user-coloured label; the colour arrives as validated `--label-*` custom properties. */
export function LabelChip({ color, children }: { color: string | undefined; children: ReactNode }) {
  const { background, foreground } = resolveLabelColors(color);
  return (
    <span
      data-slot="task-label"
      className="tw:inline-flex tw:items-center tw:rounded-md tw:border tw:border-border tw:bg-label tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-label-foreground"
      style={{ "--label-bg": background, "--label-fg": foreground } as CSSProperties}
    >
      {children}
    </span>
  );
}
