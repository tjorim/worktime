import {
  Calendar as CalendarIcon,
  Circle as CircleIcon,
  Plane as PlaneIcon,
  Play as PlayIcon,
  Plus as PlusIcon,
  Timer as TimerIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { WorkLocationDayHeader } from "@/features/timeTracking/WorkLocationDayHeader";
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
    return tasks.some(
      (task) =>
        task.stopTime &&
        !liveTime.isBefore(dayjs(task.startTime)) &&
        liveTime.isBefore(dayjs(task.stopTime)),
    );
  }, [liveTime, tasks]);

  // Default to the first label once labels are available. Safe to run during
  // render: the `!labelId` guard makes it idempotent once set.
  if (!labelId && labels[0]) setLabelId(labels[0].id);

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
        className="mobile-quick-actions md:hidden rounded-full shadow-lg size-13"
        aria-label={m.mobile_quick_actions_open()}
        aria-haspopup="dialog"
        aria-expanded={show}
        onClick={() => setShow(true)}
      >
        <Icon icon={PlusIcon} />
      </Button>

      <Dialog
        open={show}
        onOpenChange={(open) => {
          if (!open) (() => setShow(false))();
        }}
      >
        <DialogContent className="md:hidden">
          <DialogHeader>
            <DialogTitle>{m.mobile_quick_actions_title()}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4 grid gap-3 pt-2">
            {canTrackTime && (
              <div className="grid gap-2">
                {runningTask && (
                  <div className="rounded bg-muted p-2 flex flex-wrap items-center gap-2">
                    <Icon icon={CircleIcon} className="text-danger-text" fill="currentColor" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{runningTask.text}</div>
                      <div className="text-sm text-muted-foreground">
                        {labels.find((label) => label.id === runningTask.label)?.name ??
                          m.tt_unknown_label()}
                        {" · "}
                        {formatElapsed(liveTime.diff(dayjs(runningTask.startTime), "second"))}
                      </div>
                    </div>
                    <Button size="sm" variant="destructive" onClick={handleStopTimer}>
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
                  <div
                    role="alert"
                    className="rounded bg-destructive/10 text-danger-text p-2"
                    aria-live="polite"
                  >
                    {timerError}
                  </div>
                )}
                {(!runningTask || isSwitching) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor="mobileQuickTask">
                        {m.form_task()}
                      </label>
                      <Input
                        id="mobileQuickTask"
                        autoFocus
                        placeholder={m.form_task()}
                        value={taskText}
                        onChange={(event) => setTaskText(event.target.value)}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor="mobileQuickLabel">
                        {m.form_label()}
                      </label>
                      <NativeSelect
                        id="mobileQuickLabel"
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
                      </NativeSelect>
                    </div>
                  </div>
                )}
                {settings.enableCrossBorderTracking && <WorkLocationDayHeader date={today} />}
                {(!runningTask || isSwitching) && (
                  <Button
                    size="sm"
                    disabled={Boolean((!runningTask && taskAtCurrentTime) || !labelId)}
                    onClick={() => void handleStartTimer()}
                  >
                    <Icon icon={PlayIcon} className="mr-1" />
                    {runningTask ? m.mobile_quick_actions_switch_now() : m.tt_start_now()}
                  </Button>
                )}
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 gap-1">
              {canTrackTime && (
                <Button
                  variant="link"
                  size="sm"
                  className="flex-1 px-1"
                  aria-label={m.mobile_quick_actions_open_time_tracking()}
                  onClick={() => runAction(onTrackTime)}
                >
                  <Icon icon={TimerIcon} className="mr-1" />
                  {m.mobile_quick_actions_time()}
                </Button>
              )}
              {canAddTimeOff && (
                <Button
                  variant="link"
                  size="sm"
                  className="flex-1 px-1"
                  aria-label={m.mobile_quick_actions_add_time_off()}
                  onClick={() => runAction(onAddTimeOff)}
                >
                  <Icon icon={PlaneIcon} className="mr-1" />
                  {m.mobile_quick_actions_time_off()}
                </Button>
              )}
              <Button
                variant="link"
                size="sm"
                className="flex-1 px-1"
                aria-label={m.mobile_quick_actions_open_calendar()}
                onClick={() => runAction(onOpenCalendar)}
              >
                <Icon icon={CalendarIcon} className="mr-1" />
                {m.mobile_quick_actions_calendar()}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
