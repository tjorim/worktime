import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native picker for compact domain controls, including mobile schedule forms. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "tw:h-8 tw:max-w-full tw:rounded-lg tw:border tw:border-input tw:bg-background tw:px-2 tw:text-sm tw:text-foreground tw:focus-visible:outline-2 tw:focus-visible:outline-ring tw:disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
