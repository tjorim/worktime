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
          className="tw:isolate tw:z-popover"
        >
          <PopoverPrimitive.Popup className="tw:max-w-popover tw:rounded-md tw:border tw:border-border tw:bg-popover tw:text-sm tw:text-popover-foreground tw:shadow-md tw:outline-none">
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
        "tw:m-0 tw:border-b tw:border-border tw:bg-muted tw:px-4 tw:py-2 tw:text-sm tw:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export function PopoverBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("tw:px-4 tw:py-2", className)} {...props} />;
}

/** Header for descriptive detail cards without dialog focus management. */
export function DetailsHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "tw:m-0 tw:border-b tw:border-border tw:bg-muted tw:px-4 tw:py-2 tw:text-sm tw:font-semibold",
        className,
      )}
      {...props}
    />
  );
}
