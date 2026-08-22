import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { WorkLocationDayHeader } from "@/components/timeTracking/WorkLocationDayHeader";
import { useSettings } from "@/contexts/SettingsContext";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

interface MobileQuickActionsProps {
  canAddTimeOff: boolean;
  canTrackTime: boolean;
  onAddTimeOff: () => void;
  onTrackTime: () => void;
  onOpenCalendar: () => void;
}

export function MobileQuickActions({
  canAddTimeOff,
  canTrackTime,
  onAddTimeOff,
  onTrackTime,
  onOpenCalendar,
}: MobileQuickActionsProps) {
  const [show, setShow] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [labelId, setLabelId] = useState("");
  const [timerError, setTimerError] = useState("");
  const { settings } = useSettings();
  const { tasks, labels, addTask } = useTimeTrackingStorage();
  const today = dayjs().format("YYYY-MM-DD");
  const runningTask = useMemo(() => tasks.find((task) => !task.stopTime) ?? null, [tasks]);
  const taskAtCurrentTime = useMemo(() => {
    const now = dayjs();
    return tasks.some(
      (task) =>
        task.stopTime && !now.isBefore(dayjs(task.startTime)) && now.isBefore(dayjs(task.stopTime)),
    );
  }, [tasks]);

  useEffect(() => {
    if (!labelId && labels[0]) setLabelId(labels[0].id);
  }, [labelId, labels]);

  const runAction = (action: () => void) => {
    setShow(false);
    action();
  };

  const handleStartTimer = async () => {
    setTimerError("");
    if (runningTask) {
      setTimerError(m.tt_error_task_already_running_start());
      return;
    }
    const now = dayjs();
    const overlapsCurrentTask = tasks.some(
      (task) =>
        task.stopTime && !now.isBefore(dayjs(task.startTime)) && now.isBefore(dayjs(task.stopTime)),
    );
    if (overlapsCurrentTask) {
      setTimerError(m.tt_error_time_overlap());
      return;
    }
    if (!labelId) {
      setTimerError(m.tt_error_configure_label());
      return;
    }
    const added = await addTask({
      id: crypto.randomUUID(),
      text: taskText.trim() || m.tt_default_task_name(),
      label: labelId,
      startTime: now.format("YYYY-MM-DDTHH:mm"),
    });
    if (!added) {
      setTimerError(m.tt_error_task_already_running_start());
      return;
    }
    setTaskText("");
    setShow(false);
  };

  return (
    <>
      <Button
        className="mobile-quick-actions d-md-none rounded-circle shadow"
        aria-label={m.mobile_quick_actions_open()}
        aria-haspopup="dialog"
        aria-expanded={show}
        onClick={() => setShow(true)}
      >
        <i className="bi bi-stopwatch" aria-hidden="true" />
      </Button>

      <Modal show={show} onHide={() => setShow(false)} centered className="d-md-none">
        <Modal.Header closeButton>
          <Modal.Title>{m.mobile_quick_actions_title()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-2">
          {canTrackTime && (
            <div className="d-grid gap-3 mb-2">
              <div className="fw-semibold">
                <i className="bi bi-stopwatch me-2" aria-hidden="true" />
                {m.mobile_quick_actions_track_time()}
              </div>
              {timerError && (
                <Alert variant="danger" className="mb-0 py-2" aria-live="polite">
                  {timerError}
                </Alert>
              )}
              <Form.Group controlId="mobileQuickTask">
                <Form.Label>{m.form_task()}</Form.Label>
                <Form.Control
                  autoFocus
                  value={taskText}
                  onChange={(event) => setTaskText(event.target.value)}
                />
              </Form.Group>
              <Form.Group controlId="mobileQuickLabel">
                <Form.Label>{m.form_label()}</Form.Label>
                <Form.Select
                  value={labelId}
                  disabled={labels.length === 0}
                  onChange={(event) => setLabelId(event.target.value)}
                >
                  {labels.length === 0 && <option value="">{m.tt_add_labels_first()}</option>}
                  {labels.map((label) => (
                    <option key={label.id} value={label.id}>
                      {label.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              {settings.enableCrossBorderTracking && <WorkLocationDayHeader date={today} />}
              <div className="d-grid gap-2">
                <Button
                  disabled={Boolean(runningTask || taskAtCurrentTime || !labelId)}
                  onClick={() => void handleStartTimer()}
                >
                  <i className="bi bi-play-fill me-1" aria-hidden="true" />
                  {m.tt_start_now()}
                </Button>
                <Button variant="link" size="sm" onClick={() => runAction(onTrackTime)}>
                  {m.mobile_quick_actions_open_time_tracking()}
                </Button>
              </div>
            </div>
          )}
          {canAddTimeOff && (
            <Button variant="outline-primary" onClick={() => runAction(onAddTimeOff)}>
              <i className="bi bi-airplane me-2" aria-hidden="true" />
              {m.mobile_quick_actions_add_time_off()}
            </Button>
          )}
          <Button variant="outline-primary" onClick={() => runAction(onOpenCalendar)}>
            <i className="bi bi-calendar3 me-2" aria-hidden="true" />
            {m.mobile_quick_actions_open_calendar()}
          </Button>
        </Modal.Body>
      </Modal>
    </>
  );
}
