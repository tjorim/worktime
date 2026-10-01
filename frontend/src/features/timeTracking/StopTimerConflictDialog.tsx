import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import * as m from "@/paraglide/messages.js";
import { dayjs } from "@/utils/dateTimeUtils";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";

type StopTimerConflictDialogProps = {
  isOpen: boolean;
  runningTask: StoredTimeTrackingTask | null;
  conflictingTasks: StoredTimeTrackingTask[];
  initialStopTime: string;
  onConfirm: (stopTime: string) => void;
  onClose: () => void;
};

export function StopTimerConflictDialog({
  isOpen,
  runningTask,
  conflictingTasks,
  initialStopTime,
  onConfirm,
  onClose,
}: StopTimerConflictDialogProps) {
  // Captured on mount; the parent remounts this dialog with a key for each conflict.
  const [stopTime, setStopTime] = useState(initialStopTime);
  const startTime = runningTask ? dayjs(runningTask.startTime).format("HH:mm") : "";
  const isValid = Boolean(stopTime && stopTime > startTime && stopTime <= initialStopTime);

  const effects = useMemo(
    () =>
      isValid
        ? conflictingTasks.map((task) => {
            const taskStart = dayjs(task.startTime).format("HH:mm");
            const taskStop = task.stopTime ? dayjs(task.stopTime).format("HH:mm") : "";
            const outcome =
              stopTime <= taskStart ? "unchanged" : stopTime < taskStop ? "shortened" : "removed";
            return { task, taskStart, taskStop, outcome };
          })
        : [],
    [conflictingTasks, isValid, stopTime],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.tt_stop_conflict_title()}</DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          <p>{m.tt_stop_conflict_intro()}</p>
          <Field className="tw:mb-3">
            <FieldLabel htmlFor="stopTimerConflictTime">{m.tt_stop_time()}</FieldLabel>
            <Input
              id="stopTimerConflictTime"
              type="time"
              value={stopTime}
              min={startTime}
              max={initialStopTime}
              onChange={(event) => setStopTime(event.target.value)}
              aria-invalid={Boolean(stopTime) && !isValid}
              aria-describedby="stopTimerConflictRange"
            />
            <FieldDescription id="stopTimerConflictRange">
              {m.tt_stop_conflict_range({ start: startTime, now: initialStopTime })}
            </FieldDescription>
          </Field>

          <div aria-live="polite">
            {effects.map(({ task, taskStart, taskStop, outcome }) => (
              <Alert
                key={task.id}
                variant={outcome === "removed" ? "warning" : "default"}
                className="tw:mb-2"
              >
                {outcome === "unchanged"
                  ? m.tt_plan_unchanged({ task: task.text, start: taskStart, stop: taskStop })
                  : outcome === "shortened"
                    ? m.tt_plan_shortened({
                        task: task.text,
                        oldStart: taskStart,
                        newStart: stopTime,
                        stop: taskStop,
                      })
                    : m.tt_plan_removed({ task: task.text, start: taskStart, stop: taskStop })}
              </Alert>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {m.cancel()}
          </Button>
          <Button variant="destructive" disabled={!isValid} onClick={() => onConfirm(stopTime)}>
            {m.tt_stop_adjust_plan()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
