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
    <span className={cn("inline-flex items-center", className)} {...props}>
      <Icon
        icon={LoaderCircle}
        className={cn(
          "animate-spin motion-reduce:animate-none",
          size === "sm" ? "size-4" : "size-8",
        )}
      />
      {children}
    </span>
  );
}
