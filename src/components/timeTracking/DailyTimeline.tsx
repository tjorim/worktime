import { useCallback, useMemo } from "react";
import { dayjs } from "../../utils/dateTimeUtils";
import {
  buildLabelColorMap,
  getContrastingTextColor,
  getDefaultLabelColor,
  type TimeTrackingLabel,
} from "./constants";
import type { StoredTimeTrackingTask } from "./types";

/** Minutes of padding added before the earliest start and after the latest stop. */
const PADDING_MINUTES = 30;

/** Height of each task row in pixels. */
const ROW_HEIGHT = 36;

/** Height of the time axis in pixels. */
const AXIS_HEIGHT = 28;

type DailyTimelineProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  /** Live current time, used to draw the Now line and size running tasks. */
  liveTime?: dayjs.Dayjs;
  /** Whether the selected date is today (shows the Now line). */
  isToday?: boolean;
};

export function DailyTimeline({ tasks, labels, liveTime, isToday }: DailyTimelineProps) {
  const colorByLabelId = useMemo(() => buildLabelColorMap(labels), [labels]);

  const { minMinutes, maxMinutes, totalMinutes } = useMemo(() => {
    if (tasks.length === 0) return { minMinutes: 0, maxMinutes: 60, totalMinutes: 60 };

    let min = Infinity;
    let max = -Infinity;

    for (const task of tasks) {
      const start = dayjs(task.startTime);
      const startMin = start.hour() * 60 + start.minute();
      min = Math.min(min, startMin);

      if (task.stopTime) {
        const stop = dayjs(task.stopTime);
        max = Math.max(max, stop.hour() * 60 + stop.minute());
      } else if (liveTime) {
        max = Math.max(max, liveTime.hour() * 60 + liveTime.minute());
      } else {
        max = Math.max(max, startMin + 60);
      }
    }

    // Extend visible range to include the Now position when viewing today.
    if (isToday && liveTime) {
      const nowMin = liveTime.hour() * 60 + liveTime.minute();
      min = Math.min(min, nowMin);
      max = Math.max(max, nowMin);
    }

    const paddedMin = Math.max(0, min - PADDING_MINUTES);
    const paddedMax = Math.min(24 * 60, max + PADDING_MINUTES);
    return { minMinutes: paddedMin, maxMinutes: paddedMax, totalMinutes: paddedMax - paddedMin };
  }, [tasks, liveTime, isToday]);

  const timeToPercent = useCallback(
    (minutes: number) => ((minutes - minMinutes) / totalMinutes) * 100,
    [minMinutes, totalMinutes],
  );

  const hourTicks = useMemo(() => {
    const ticks: { hour: number; pct: number }[] = [];
    const startHour = Math.ceil(minMinutes / 60);
    const endHour = Math.floor(maxMinutes / 60);
    for (let h = startHour; h <= endHour; h++) {
      ticks.push({ hour: h, pct: timeToPercent(h * 60) });
    }
    return ticks;
  }, [minMinutes, maxMinutes, timeToPercent]);

  const nowPct = useMemo(() => {
    if (!isToday || !liveTime) return null;
    const nowMin = liveTime.hour() * 60 + liveTime.minute();
    if (nowMin < minMinutes || nowMin > maxMinutes) return null;
    return timeToPercent(nowMin);
  }, [isToday, liveTime, minMinutes, maxMinutes, timeToPercent]);

  if (tasks.length === 0) return null;

  const contentHeight = tasks.length * ROW_HEIGHT;

  return (
    <div className="my-3" data-testid="daily-timeline">
      {/* Time axis */}
      <div style={{ position: "relative", height: AXIS_HEIGHT }}>
        {hourTicks.map(({ hour, pct }) => (
          <span
            key={hour}
            style={{
              position: "absolute",
              left: `${pct}%`,
              transform: "translateX(-50%)",
              fontSize: "0.7rem",
              color: "var(--bs-secondary)",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {String(hour).padStart(2, "0")}:00
          </span>
        ))}
      </div>

      {/* Task tracks */}
      <div
        style={{
          position: "relative",
          height: contentHeight,
          borderTop: "1px solid var(--bs-border-color)",
        }}
      >
        {/* Vertical grid lines at each hour */}
        {hourTicks.map(({ hour, pct }) => (
          <div
            key={hour}
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: 0,
              bottom: 0,
              width: "1px",
              backgroundColor: "var(--bs-border-color)",
            }}
            aria-hidden="true"
          />
        ))}

        {/* Task bars */}
        {tasks.map((task, index) => {
          const start = dayjs(task.startTime);
          const startMin = start.hour() * 60 + start.minute();
          const effectiveStop = task.stopTime ? dayjs(task.stopTime) : (liveTime ?? dayjs());
          const stopMin = effectiveStop.hour() * 60 + effectiveStop.minute();
          const leftPct = timeToPercent(startMin);
          const widthPct = Math.max(((stopMin - startMin) / totalMinutes) * 100, 0.5);
          const color = colorByLabelId[task.label] ?? getDefaultLabelColor();
          const textColor = getContrastingTextColor(color);
          const startLabel = start.format("HH:mm");
          const stopLabel = task.stopTime ? effectiveStop.format("HH:mm") : "Running";
          const ariaLabel = `${task.text}: ${startLabel}–${stopLabel}`;

          return (
            <div
              key={task.id}
              title={ariaLabel}
              aria-label={ariaLabel}
              style={{
                position: "absolute",
                top: index * ROW_HEIGHT + 4,
                height: ROW_HEIGHT - 8,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: color,
                color: textColor,
                borderRadius: "4px",
                padding: "0 6px",
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
                fontSize: "0.75rem",
                fontWeight: 600,
                boxSizing: "border-box",
              }}
            >
              {widthPct > 8 ? task.text : ""}
            </div>
          );
        })}

        {/* Now line */}
        {nowPct !== null && (
          <div
            style={{
              position: "absolute",
              left: `${nowPct}%`,
              top: 0,
              bottom: 0,
              width: "2px",
              backgroundColor: "var(--bs-danger)",
              transform: "translateX(-50%)",
              zIndex: 1,
            }}
            data-testid="timeline-now-line"
            aria-label={`Current time: ${liveTime!.format("HH:mm")}`}
          >
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                backgroundColor: "var(--bs-danger)",
                color: "white",
                fontSize: "0.65rem",
                fontWeight: 600,
                padding: "2px 5px",
                borderRadius: "9999px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {liveTime!.format("HH:mm")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
