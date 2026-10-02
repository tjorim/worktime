import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
const spans: Record<number, string> = {
  2: "tw:col-span-2",
  3: "tw:col-span-3",
  4: "tw:col-span-4",
  5: "tw:col-span-5",
  6: "tw:col-span-6",
  7: "tw:col-span-7",
  8: "tw:col-span-8",
  12: "tw:col-span-12",
};
const desktopSpans: Record<number, string> = {
  2: "tw:md:col-span-2",
  3: "tw:md:col-span-3",
  4: "tw:md:col-span-4",
  5: "tw:md:col-span-5",
  6: "tw:md:col-span-6",
  7: "tw:md:col-span-7",
  8: "tw:md:col-span-8",
  12: "tw:md:col-span-12",
};
type GridSpan = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 12;
export function Grid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("tw:grid tw:grid-cols-12 tw:gap-4", className)} {...props} />;
}
export function GridItem({
  span = 12,
  desktopSpan,
  className,
  ...props
}: ComponentProps<"div"> & { span?: GridSpan; desktopSpan?: GridSpan }) {
  return (
    <div
      className={cn("tw:min-w-0", spans[span], desktopSpan && desktopSpans[desktopSpan], className)}
      {...props}
    />
  );
}
