import type { CSSProperties, ReactNode } from "react";
import { resolveLabelColors } from "./cssVars";

/** A user-colored label; the color arrives as validated `--label-*` custom properties. */
export function LabelChip({ color, children }: { color: string | undefined; children: ReactNode }) {
  const { background, foreground } = resolveLabelColors(color);
  return (
    <span
      data-slot="task-label"
      className="inline-flex items-center rounded-md border border-border bg-label px-2 py-0.5 text-xs font-semibold text-label-foreground"
      style={{ "--label-bg": background, "--label-fg": foreground } as CSSProperties}
    >
      {children}
    </span>
  );
}
