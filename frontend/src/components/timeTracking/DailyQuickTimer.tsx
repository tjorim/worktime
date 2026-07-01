import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import Button from "react-bootstrap/Button";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";
import { getContrastingTextColor } from "./constants";
import type { StoredTimeTrackingTask } from "./types";

interface DailyQuickTimerProps {
  runningTask: StoredTimeTrackingTask | null;
  liveTime: Dayjs;
  colorByLabelId: Record<string, string>;
  labelNameById: Record<string, string>;
  defaultLabelColor: string;
  onStopNow: () => void;
}

function formatDuration(totalSeconds: number) {
  const clampedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clampedSeconds / 3600);
  const minutes = Math.floor((clampedSeconds % 3600) / 60);
  const seconds = clampedSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function DailyQuickTimer({
  runningTask,
  liveTime,
  colorByLabelId,
  labelNameById,
  defaultLabelColor,
  onStopNow,
}: DailyQuickTimerProps) {
  const runningElapsed = useMemo(() => {
    if (!runningTask) {
      return null;
    }
    const start = dayjs(runningTask.startTime);
    return formatDuration(liveTime.diff(start, "second"));
  }, [liveTime, runningTask]);

  const runningLabelBackground = runningTask
    ? (colorByLabelId[runningTask.label] ?? defaultLabelColor)
    : defaultLabelColor;
  const runningLabelTextColor = getContrastingTextColor(runningLabelBackground);

  return (
    <div className="border rounded p-3 mb-3">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <div className="fw-semibold">{m.tt_quick_timer()}</div>
          <div className="small text-muted">{m.tt_quick_timer_desc()}</div>
        </div>
        {runningTask ? (
          <span className="badge text-bg-success">{m.tt_running_status()}</span>
        ) : (
          <span className="badge text-bg-secondary">{m.tt_idle_status()}</span>
        )}
      </div>
      {runningTask ? (
        <div className="mt-2">
          <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div>
              <div className="fw-semibold">
                {runningTask.text}{" "}
                <span
                  className="time-tracking-label"
                  style={{
                    backgroundColor: runningLabelBackground,
                    color: runningLabelTextColor,
                  }}
                >
                  {labelNameById[runningTask.label] ?? m.tt_unknown_label()}
                </span>
              </div>
              <div className="small text-muted">
                {m.tt_started()} {dayjs(runningTask.startTime).format("HH:mm")} &middot;{" "}
                {m.tt_elapsed()} {runningElapsed}
              </div>
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={onStopNow}
              aria-label={m.tt_stop_timer_for({ task: runningTask.text })}
            >
              {m.tt_stop_timer()}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 d-flex flex-wrap align-items-center gap-2">
          <span className="text-muted small">{m.tt_enter_task_hint()}</span>
        </div>
      )}
    </div>
  );
}
