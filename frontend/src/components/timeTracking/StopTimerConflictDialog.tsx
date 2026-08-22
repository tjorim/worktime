import { useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import * as m from "@/paraglide/messages.js";
import { dayjs } from "@/utils/dateTimeUtils";
import type { StoredTimeTrackingTask } from "./types";

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
        const outcome = stopTime <= taskStart ? "unchanged" : stopTime < taskStop ? "shortened" : "removed";
        return { task, taskStart, taskStop, outcome };
          })
        : [],
    [conflictingTasks, isValid, stopTime],
  );

  return (
    <Modal show={isOpen} onHide={onClose} centered restoreFocus>
      <Modal.Header closeButton>
        <Modal.Title>{m.tt_stop_conflict_title()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{m.tt_stop_conflict_intro()}</p>
        <Form.Group controlId="stopTimerConflictTime" className="mb-3">
          <Form.Label>{m.tt_stop_time()}</Form.Label>
          <Form.Control
            type="time"
            value={stopTime}
            min={startTime}
            max={initialStopTime}
            onChange={(event) => setStopTime(event.target.value)}
            isInvalid={Boolean(stopTime) && !isValid}
          />
          <Form.Text muted>
            {m.tt_stop_conflict_range({ start: startTime, now: initialStopTime })}
          </Form.Text>
        </Form.Group>

        <div aria-live="polite">
          {effects.map(({ task, taskStart, taskStop, outcome }) => (
            <Alert
              key={task.id}
              variant={outcome === "removed" ? "warning" : "secondary"}
              className="py-2 mb-2"
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
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {m.cancel()}
        </Button>
        <Button variant="danger" disabled={!isValid} onClick={() => onConfirm(stopTime)}>
          {m.tt_stop_adjust_plan()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
