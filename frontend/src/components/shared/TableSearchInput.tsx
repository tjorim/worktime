import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function TableSearchInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input type="search" className={cn("tw:max-w-80", className)} {...props} />;
}
