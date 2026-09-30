import * as m from "@/paraglide/messages";

import * as React from "react";
import { XIcon } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "tw:fixed tw:inset-0 tw:z-dialog-overlay tw:bg-overlay/50 tw:data-closed:hidden",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  children,
  showCloseButton = true,
  overlayProps,
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  overlayProps?: AlertDialogPrimitive.Backdrop.Props;
  size?: "default" | "sm";
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay {...overlayProps} />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "tw:dialog-viewport tw:fixed tw:top-1/2 tw:left-1/2 tw:z-dialog tw:max-w-dialog tw:-translate-x-1/2 tw:-translate-y-1/2 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-border tw:bg-background tw:text-foreground tw:outline-none tw:data-closed:hidden",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <AlertDialogPrimitive.Close
            render={
              <Button variant="ghost" size="icon-sm" className="tw:absolute tw:top-3 tw:right-3" />
            }
            aria-label={m.close()}
          >
            <XIcon />
          </AlertDialogPrimitive.Close>
        )}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "tw:flex tw:shrink-0 tw:items-center tw:border-b tw:border-border tw:p-4 tw:pr-14",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "tw:flex tw:shrink-0 tw:flex-wrap tw:justify-end tw:gap-2 tw:border-t tw:border-border tw:p-4",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-media" className={cn("", className)} {...props} />;
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("tw:m-0 tw:text-xl tw:font-medium tw:leading-normal", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("", className)}
      {...props}
    />
  );
}

function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" className={cn(className)} {...props} />;
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
