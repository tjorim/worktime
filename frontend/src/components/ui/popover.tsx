import type { ReactElement, ReactNode, ComponentProps } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

/** Click-open content uses Base UI dismissal and focus management. */
export function DetailsPopover({
  children,
  content,
  placement = "top",
}: {
  children: ReactElement;
  content: ReactNode;
  placement?: "top" | "left-end";
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger render={children} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side={placement === "left-end" ? "left" : "top"}
          align={placement === "left-end" ? "end" : "center"}
          sideOffset={8}
          className="isolate z-popover"
        >
          <PopoverPrimitive.Popup className="max-w-popover rounded-md border border-border bg-popover text-sm text-popover-foreground shadow-md outline-none">
            {content}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function PopoverHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <PopoverPrimitive.Title
      render={<div />}
      className={cn(
        "m-0 border-b border-border bg-muted px-4 py-2 text-sm font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export function PopoverBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 py-2", className)} {...props} />;
}

/** Header for descriptive detail cards without dialog focus management. */
export function DetailsHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "m-0 border-b border-border bg-muted px-4 py-2 text-sm font-semibold",
        className,
      )}
      {...props}
    />
  );
}
