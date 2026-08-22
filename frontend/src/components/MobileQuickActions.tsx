import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Stack from "react-bootstrap/Stack";
import { WorkLocationDayHeader } from "@/components/timeTracking/WorkLocationDayHeader";
import { useSettings } from "@/contexts/SettingsContext";
import { useLiveTime } from "@/hooks/useLiveTime";
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
  const [isSwitching, setIsSwitching] = useState(false);
  const { settings } = useSettings();
  const { tasks, labels, addTask, updateTaskTimes, switchRunningTask } = useTimeTrackingStorage();
  const liveTime = useLiveTime({ precision: "second" });
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

  const stopIssue = (now: ReturnType<typeof dayjs>) => {
    if (!runningTask) return null;
    const start = dayjs(runningTask.startTime);
    const crossesDay = !now.isSame(start, "day");
    const isTooShort = now.diff(start, "minute") < 1;
    const reachesPlannedTask = tasks.some(
      (task) =>
        task.id !== runningTask.id &&
        task.stopTime &&
        dayjs(task.startTime).isAfter(start) &&
        !dayjs(task.startTime).isAfter(now),
    );
    return crossesDay || isTooShort || reachesPlannedTask
      ? m.mobile_quick_actions_resolve_stop()
      : null;
  };

  const handleStopTimer = () => {
    if (!runningTask) return;
    setTimerError("");
    const now = dayjs();
    const issue = stopIssue(now);
    if (issue) {
      setTimerError(issue);
      return;
    }
    updateTaskTimes({
      id: runningTask.id,
      newStartTime: runningTask.startTime,
      newStopTime: now.format("YYYY-MM-DDTHH:mm"),
    });
    setIsSwitching(false);
  };

  const handleStartTimer = async () => {
    setTimerError("");
    if (runningTask && !isSwitching) {
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
    const nextTask = {
      id: crypto.randomUUID(),
      text: taskText.trim() || m.tt_default_task_name(),
      label: labelId,
      startTime: now.format("YYYY-MM-DDTHH:mm"),
    };
    if (runningTask) {
      const issue = stopIssue(now);
      if (issue) {
        setTimerError(issue);
        return;
      }
      if (
        !switchRunningTask({
          runningTaskId: runningTask.id,
          stopTime: nextTask.startTime,
          nextTask,
        })
      ) {
        setTimerError(m.mobile_quick_actions_resolve_stop());
        return;
      }
      setTaskText("");
      setIsSwitching(false);
      setShow(false);
      return;
    }
    const added = await addTask(nextTask);
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
        <i className="bi bi-plus-lg" aria-hidden="true" />
      </Button>

      <Modal show={show} onHide={() => setShow(false)} centered className="d-md-none">
        <Modal.Header closeButton>
          <Modal.Title>{m.mobile_quick_actions_title()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-3 pt-2">
          {canTrackTime && (
            <div className="d-grid gap-2">
              {runningTask && (
                <div className="rounded bg-body-tertiary p-2 d-flex align-items-center gap-2">
                  <i className="bi bi-record-fill text-danger" aria-hidden="true" />
                  <div className="min-w-0 flex-grow-1">
                    <div className="fw-semibold text-truncate">{runningTask.text}</div>
                    <div className="small text-muted">
                      {labels.find((label) => label.id === runningTask.label)?.name ??
                        m.tt_unknown_label()}
                      {" · "}
                      {formatElapsed(liveTime.diff(dayjs(runningTask.startTime), "second"))}
                    </div>
                  </div>
                  <Button size="sm" variant="outline-danger" onClick={handleStopTimer}>
                    {m.tt_stop_timer()}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setTimerError("");
                      setIsSwitching((value) => !value);
                    }}
                  >
                    {m.mobile_quick_actions_switch()}
                  </Button>
                </div>
              )}
              {timerError && (
                <Alert variant="danger" className="mb-0 py-2" aria-live="polite">
                  {timerError}
                </Alert>
              )}
              {(!runningTask || isSwitching) && (
                <Stack direction="horizontal" gap={2}>
                  <Form.Group controlId="mobileQuickTask" className="flex-grow-1 min-w-0">
                    <Form.Label visuallyHidden>{m.form_task()}</Form.Label>
                    <Form.Control
                      autoFocus
                      placeholder={m.form_task()}
                      value={taskText}
                      onChange={(event) => setTaskText(event.target.value)}
                    />
                  </Form.Group>
                  <Form.Group controlId="mobileQuickLabel" style={{ width: "42%" }}>
                    <Form.Label visuallyHidden>{m.form_label()}</Form.Label>
                    <Form.Select
                      aria-label={m.form_label()}
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
                </Stack>
              )}
              {settings.enableCrossBorderTracking && <WorkLocationDayHeader date={today} />}
              {(!runningTask || isSwitching) && (
                <Button
                  size="sm"
                  disabled={Boolean((!runningTask && taskAtCurrentTime) || !labelId)}
                  onClick={() => void handleStartTimer()}
                >
                  <i className="bi bi-play-fill me-1" aria-hidden="true" />
                  {runningTask ? m.mobile_quick_actions_switch_now() : m.tt_start_now()}
                </Button>
              )}
            </div>
          )}
          <Stack direction="horizontal" gap={1} className="justify-content-between border-top pt-2">
            {canTrackTime && (
              <Button
                variant="link"
                size="sm"
                className="flex-fill px-1"
                aria-label={m.mobile_quick_actions_open_time_tracking()}
                onClick={() => runAction(onTrackTime)}
              >
                <i className="bi bi-stopwatch me-1" aria-hidden="true" />
                {m.mobile_quick_actions_time()}
              </Button>
            )}
            {canAddTimeOff && (
              <Button
                variant="link"
                size="sm"
                className="flex-fill px-1"
                aria-label={m.mobile_quick_actions_add_time_off()}
                onClick={() => runAction(onAddTimeOff)}
              >
                <i className="bi bi-airplane me-1" aria-hidden="true" />
                {m.mobile_quick_actions_time_off()}
              </Button>
            )}
            <Button
              variant="link"
              size="sm"
              className="flex-fill px-1"
              aria-label={m.mobile_quick_actions_open_calendar()}
              onClick={() => runAction(onOpenCalendar)}
            >
              <i className="bi bi-calendar3 me-1" aria-hidden="true" />
              {m.mobile_quick_actions_calendar()}
            </Button>
          </Stack>
        </Modal.Body>
      </Modal>
    </>
  );
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
