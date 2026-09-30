import { useId, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

export type HintProps = {
  children: ReactElement<{ id?: string }>;
  content: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  open?: boolean;
  disabled?: boolean;
  openOnClick?: boolean;
  variant?: "tooltip" | "details";
};

/** A tooltip that keeps the child's element, handlers and ref intact (including table cells). */
export function Hint({
  children,
  content,
  placement = "top",
  open,
  disabled,
  openOnClick = false,
  variant = "tooltip",
}: HintProps) {
  const generatedTriggerId = useId();
  const triggerId = children.props.id ?? generatedTriggerId;
  const popupId = useId();
  const [clickedOpen, setClickedOpen] = useState(false);
  const controlledOpen = open ?? (openOnClick ? clickedOpen : undefined);
  return (
    <TooltipPrimitive.Root
      open={controlledOpen}
      disabled={disabled}
      onOpenChange={openOnClick ? setClickedOpen : undefined}
      triggerId={controlledOpen === undefined ? undefined : triggerId}
    >
      <TooltipPrimitive.Trigger
        id={triggerId}
        render={children}
        delay={0}
        aria-describedby={popupId}
        closeOnClick={!openOnClick && open === undefined}
        onClick={openOnClick ? () => setClickedOpen(true) : undefined}
      />
      <TooltipContent id={popupId} side={placement} variant={variant}>
        {content}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}

export function TooltipContent({
  children,
  side = "top",
  anchor,
  id,
  variant = "tooltip",
}: {
  variant?: "tooltip" | "details";
  id?: string;
  children: ReactNode;
  side?: TooltipPrimitive.Positioner.Props["side"];
  anchor?: TooltipPrimitive.Positioner.Props["anchor"];
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={6}
        anchor={anchor}
        className="tw:isolate tw:z-tooltip"
      >
        <TooltipPrimitive.Popup
          id={id}
          role="tooltip"
          className={cn(
            "tw:w-fit tw:rounded-md tw:text-sm tw:shadow-md",
            variant === "details"
              ? "tw:max-w-popover tw:border tw:border-border tw:bg-popover tw:text-popover-foreground"
              : "tw:max-w-xs tw:bg-tooltip tw:px-2 tw:py-1 tw:text-center tw:text-tooltip-foreground",
          )}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
