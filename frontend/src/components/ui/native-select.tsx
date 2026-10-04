import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native picker for compact domain controls, including mobile schedule forms. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 max-w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
