import * as m from "@/paraglide/messages";
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "tw:fixed tw:inset-0 tw:z-dialog-overlay tw:bg-overlay/50 tw:data-closed:hidden",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayProps,
  size,
  scrollable = false,
  position = "center",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  overlayProps?: DialogPrimitive.Backdrop.Props;
  size?: "lg";
  scrollable?: boolean;
  position?: "center" | "top";
}) {
  return (
    <DialogPortal>
      <DialogOverlay {...overlayProps} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "tw:dialog-viewport tw:fixed tw:top-1/2 tw:left-1/2 tw:z-dialog tw:max-w-dialog tw:-translate-x-1/2 tw:-translate-y-1/2 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-border tw:bg-background tw:text-foreground tw:outline-none tw:data-closed:hidden",
          size === "lg" && "tw:max-w-dialog-lg",
          scrollable && "tw:flex tw:flex-col tw:overflow-hidden",
          position === "top" && "tw:top-7 tw:translate-y-0",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label={m.close()}
            data-slot="dialog-close"
            render={
              <Button variant="ghost" className="tw:absolute tw:top-3 tw:right-3" size="icon-sm" />
            }
          >
            <XIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "tw:flex tw:shrink-0 tw:items-center tw:border-b tw:border-border tw:p-4 tw:pr-14",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "tw:flex tw:shrink-0 tw:flex-wrap tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:p-4",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {m.close()}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("tw:m-0 tw:text-xl tw:font-medium tw:leading-normal", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
