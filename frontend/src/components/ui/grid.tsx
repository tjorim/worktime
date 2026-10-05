import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
const spans: Record<number, string> = {
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  12: "col-span-12",
};
const desktopSpans: Record<number, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  12: "md:col-span-12",
};
type GridSpan = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 12;
export function Grid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-12 gap-4", className)} {...props} />;
}
export function GridItem({
  span = 12,
  desktopSpan,
  className,
  ...props
}: ComponentProps<"div"> & { span?: GridSpan; desktopSpan?: GridSpan }) {
  return (
    <div
      className={cn("min-w-0", spans[span], desktopSpan && desktopSpans[desktopSpan], className)}
      {...props}
    />
  );
}
