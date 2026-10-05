import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconProps extends Omit<LucideProps, "ref" | "size" | "aria-hidden"> {
  icon: LucideIcon;
}

/** Decorative icons inherit text size and color; controls provide their own accessible name. */
export function Icon({ icon: SvgIcon, className, ...props }: IconProps) {
  return (
    <SvgIcon
      {...props}
      className={cn("icon-em shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    />
  );
}
