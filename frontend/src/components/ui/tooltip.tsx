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
  const [interactionOpen, setInteractionOpen] = useState(false);
  const controlledOpen = open ?? (openOnClick ? interactionOpen : undefined);
  return (
    <TooltipPrimitive.Root
      open={controlledOpen}
      disabled={disabled}
      onOpenChange={(nextOpen, details) => {
        if (
          openOnClick &&
          !nextOpen &&
          details.reason === "trigger-hover" &&
          document.activeElement?.id === triggerId
        ) {
          details.cancel();
          return;
        }
        setInteractionOpen(nextOpen);
      }}
      triggerId={controlledOpen === undefined ? undefined : triggerId}
    >
      <TooltipPrimitive.Trigger
        id={triggerId}
        render={children}
        delay={0}
        aria-describedby={!disabled && (open ?? interactionOpen) ? popupId : undefined}
        closeOnClick={!openOnClick && open === undefined}
        onClick={openOnClick ? () => setInteractionOpen(true) : undefined}
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
        className="isolate z-tooltip"
      >
        <TooltipPrimitive.Popup
          id={id}
          role="tooltip"
          className={cn(
            "w-fit rounded-md text-sm shadow-md",
            variant === "details"
              ? "max-w-popover border border-border bg-popover text-popover-foreground"
              : "max-w-xs bg-tooltip px-2 py-1 text-center text-tooltip-foreground",
          )}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
