import { type LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import type { ReactNode } from "react";
import { useId } from "react";
import Button from "react-bootstrap/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "primary" | "warning";
  icon?: LucideIcon;
}

/**
 * Display a confirmation dialog with title, message and confirm/cancel actions.
 *
 * The dialog invokes `onCancel` when dismissed (cancel button, backdrop click or Escape) and `onConfirm` when the confirm button is clicked.
 *
 * @param title - Heading text shown at the top of the dialog
 * @param message - Body content displayed inside the dialog
 * @param confirmLabel - Label for the confirm button (defaults to "Confirm")
 * @param cancelLabel - Label for the cancel button (defaults to "Cancel")
 * @param onConfirm - Callback invoked when the confirm button is clicked
 * @param onCancel - Callback invoked when the dialog is dismissed (cancel action, backdrop click or Escape)
 * @param variant - Visual variant of the confirm button; typically "danger", "primary" or "warning" (defaults to "primary")
 * @param icon - Optional Lucide icon component displayed before the title
 * @returns The dialog element when `isOpen` is true, `null` otherwise
 */
export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "primary",
  icon,
}: ConfirmationDialogProps) {
  const bodyId = useId();

  const Root = variant === "danger" ? AlertDialog : Dialog;
  const Content = variant === "danger" ? AlertDialogContent : DialogContent;
  const Header = variant === "danger" ? AlertDialogHeader : DialogHeader;
  const Title = variant === "danger" ? AlertDialogTitle : DialogTitle;
  const Footer = variant === "danger" ? AlertDialogFooter : DialogFooter;

  return (
    <Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Content
        aria-describedby={bodyId}
        overlayProps={variant === "danger" ? { onClick: onCancel } : undefined}
      >
        <Header>
          <Title>
            {icon && <Icon icon={icon} className="me-2" />}
            {title}
          </Title>
        </Header>
        <div className="modal-body" id={bodyId}>
          {message}
        </div>
        <Footer>
          <Button variant="outline-secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Footer>
      </Content>
    </Root>
  );
}
