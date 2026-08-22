import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useToast } from "@/contexts/ToastContext";
import * as m from "@/paraglide/messages.js";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

interface DailyDiscardConfirmationProps {
  isOpen: boolean;
  runningTask: StoredTimeTrackingTask | null;
  onRemoveTask: (id: string) => void;
  onClose: () => void;
}

export function DailyDiscardConfirmation({
  isOpen,
  runningTask,
  onRemoveTask,
  onClose,
}: DailyDiscardConfirmationProps) {
  const toast = useToast();

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      title={m.tt_discard_task_title()}
      message={m.tt_discard_task_message()}
      confirmLabel={m.discard()}
      variant="danger"
      onConfirm={() => {
        if (runningTask) {
          onRemoveTask(runningTask.id);
          toast.showSuccess(m.tt_task_discarded());
        }
        onClose();
      }}
      onCancel={onClose}
    />
  );
}
