import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import * as m from "@/paraglide/messages.js";

interface ResetSettingsModalProps {
  show: boolean;
  clearTimeTrackingData: boolean;
  clearTimeOffData: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onChangeClearTimeTrackingData: (checked: boolean) => void;
  onChangeClearTimeOffData: (checked: boolean) => void;
}

export function ResetSettingsModal({
  show,
  clearTimeTrackingData,
  clearTimeOffData,
  onClose,
  onConfirm,
  onChangeClearTimeTrackingData,
  onChangeClearTimeOffData,
}: ResetSettingsModalProps) {
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.reset_settings_modal_title()}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
          <p className="m-0">{m.reset_settings_modal_body()}</p>
          <FieldGroup className="gap-2">
            <Field orientation="horizontal">
              <Checkbox
                id="reset-clear-time-tracking"
                checked={clearTimeTrackingData}
                onCheckedChange={onChangeClearTimeTrackingData}
              />
              <FieldLabel htmlFor="reset-clear-time-tracking">
                {m.reset_also_clear_time_tracking()}
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="reset-clear-time-off"
                checked={clearTimeOffData}
                onCheckedChange={onChangeClearTimeOffData}
              />
              <FieldLabel htmlFor="reset-clear-time-off">
                {m.reset_also_clear_time_off()}
              </FieldLabel>
            </Field>
          </FieldGroup>
          {(clearTimeTrackingData || clearTimeOffData) && (
            <Alert variant="warning">
              <div className="font-semibold">{m.reset_warning()}</div>
              {clearTimeTrackingData && <div>{m.reset_warning_time_tracking()}</div>}
              {clearTimeOffData && <div>{m.reset_warning_time_off()}</div>}
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {m.cancel()}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {m.reset_now()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
