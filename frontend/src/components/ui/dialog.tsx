import * as m from "@/paraglide/messages";
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { DialogMenuPortalContext } from "@/hooks/useDialogMenuPortalTarget";

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
      className={cn("fixed inset-0 z-dialog-overlay bg-overlay/50 data-closed:hidden", className)}
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
  const [menuPortalTarget, setMenuPortalTarget] = React.useState<HTMLDivElement | null>(null);

  return (
    <DialogPortal>
      <DialogMenuPortalContext.Provider value={menuPortalTarget}>
        <DialogOverlay {...overlayProps} />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            "dialog-viewport fixed top-1/2 left-1/2 z-dialog max-w-dialog -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-background text-foreground outline-none data-closed:hidden",
            size === "lg" && "max-w-dialog-lg",
            scrollable && "flex flex-col overflow-hidden",
            position === "top" && "top-7 translate-y-0",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              aria-label={m.close()}
              data-slot="dialog-close"
              render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
            >
              <XIcon />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
        {/* Keep picker menus inside the modal portal, outside its clipping scroll containers. */}
        <div data-base-ui-portal="" ref={setMenuPortalTarget} />
      </DialogMenuPortalContext.Provider>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 items-center border-b border-border p-4 pr-14", className)}
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
        "flex shrink-0 flex-wrap justify-end gap-2 border-t border-border p-4",
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
      className={cn("m-0 text-xl font-medium leading-normal", className)}
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
