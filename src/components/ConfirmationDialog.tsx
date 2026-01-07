import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "primary" | "warning";
}

/**
 * Display a confirmation dialog with title, message and confirm/cancel actions.
 *
 * The dialog invokes `onCancel` when dismissed (cancel button, backdrop click or Escape) and `onConfirm` when the confirm button is clicked.
 *
 * @param title - Heading text shown at the top of the dialog
 * @param message - Body text displayed inside the dialog
 * @param confirmLabel - Label for the confirm button (defaults to "Confirm")
 * @param cancelLabel - Label for the cancel button (defaults to "Cancel")
 * @param onConfirm - Callback invoked when the confirm button is clicked
 * @param onCancel - Callback invoked when the dialog is dismissed (cancel action, backdrop click or Escape)
 * @param variant - Visual variant of the confirm button; typically "danger", "primary" or "warning" (defaults to "primary")
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
}: ConfirmationDialogProps) {
  return (
    <Modal show={isOpen} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{message}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
