import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";
export function Spinner({
  className,
  children,
  size,
  ...props
}: ComponentProps<"span"> & { size?: "sm" }) {
  return (
    <span className={cn("tw:inline-flex tw:items-center", className)} {...props}>
      <Icon
        icon={LoaderCircle}
        className={cn(
          "tw:animate-spin tw:motion-reduce:animate-none",
          size === "sm" ? "tw:size-4" : "tw:size-8",
        )}
      />
      {children}
    </span>
  );
}
