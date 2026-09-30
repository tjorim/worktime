import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
const spans: Record<number, string> = {
  2: "tw:col-span-2",
  3: "tw:col-span-3",
  4: "tw:col-span-4",
  6: "tw:col-span-6",
  12: "tw:col-span-12",
};
const desktopSpans: Record<number, string> = {
  2: "tw:md:col-span-2",
  3: "tw:md:col-span-3",
  4: "tw:md:col-span-4",
  6: "tw:md:col-span-6",
  12: "tw:md:col-span-12",
};
export function Grid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("tw:grid tw:grid-cols-12 tw:gap-4", className)} {...props} />;
}
export function GridItem({
  span = 12,
  desktopSpan,
  className,
  ...props
}: ComponentProps<"div"> & { span?: 2 | 3 | 4 | 6 | 12; desktopSpan?: 2 | 3 | 4 | 6 | 12 }) {
  return (
    <div
      className={cn("tw:min-w-0", spans[span], desktopSpan && desktopSpans[desktopSpan], className)}
      {...props}
    />
  );
}
