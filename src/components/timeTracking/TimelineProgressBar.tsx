import { useMemo } from "react";
import BootstrapProgressBar from "react-bootstrap/ProgressBar";
import { dayjs } from "../../utils/dateTimeUtils";
import {
  buildLabelColorMap,
  getContrastingTextColor,
  getDefaultLabelColor,
  type TimeTrackingLabel,
} from "./constants";
import type { StoredTimeTrackingTask } from "./types";
import {
  BREAK_DURATION_MINUTES,
  effectiveDurationHours,
  calculateBreakPosition,
} from "./timeUtils";

const DEFAULT_TARGET_HOURS = 8;

type TimelineProgressBarProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  targetHours?: number;
  liveTime?: dayjs.Dayjs;
  /** Whether the selected date is today. Shows the Now line when true. */
  isToday?: boolean;
};

type TaskSegment = {
  id: string;
  text: string;
  color: string;
  textColor: string;
  /** Effective working hours (break already deducted). */
  durationHours: number;
  percentage: number;
  includesBreak?: boolean;
  /** Hours of work before the break slice. */
  beforeBreakHours?: number;
  /** Hours of the break slice itself. */
  breakHours?: number;
  /** Hours of work after the break slice. */
  afterBreakHours?: number;
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  padding: "0 0.25rem",
};

export function TimelineProgressBar({
  tasks,
  labels,
  targetHours = DEFAULT_TARGET_HOURS,
  liveTime,
  isToday,
}: TimelineProgressBarProps) {
  // Validate and sanitize targetHours: ensure it's finite and > 0
  const sanitizedTargetHours =
    Number.isFinite(targetHours) && targetHours > 0 ? targetHours : DEFAULT_TARGET_HOURS;

  // Build color map from labels using shared helper
  const colorByLabelId = useMemo(() => buildLabelColorMap(labels), [labels]);

  // Calculate segments for each task
  const segments = useMemo<TaskSegment[]>(() => {
    return tasks.map((task) => {
      const startDayjs = dayjs(task.startTime);
      const stopDayjs = task.stopTime ? dayjs(task.stopTime) : (liveTime ?? dayjs());
      const rawDurationHours = Math.max(stopDayjs.diff(startDayjs, "hour", true), 0);
      const durationHours = effectiveDurationHours(rawDurationHours, task.includesBreak);
      const color = colorByLabelId[task.label] ?? getDefaultLabelColor();
      const textColor = getContrastingTextColor(color);

      const segment: TaskSegment = {
        id: task.id,
        text: task.text,
        color,
        textColor,
        durationHours,
        percentage: (durationHours / sanitizedTargetHours) * 100,
        includesBreak: task.includesBreak,
      };

      if (task.includesBreak && rawDurationHours > 0) {
        // Calculate break position based on actual clock times and lunch window
        const taskStartMinutes = startDayjs.hour() * 60 + startDayjs.minute();
        const taskStopMinutes = stopDayjs.hour() * 60 + stopDayjs.minute();
        const pos = calculateBreakPosition(taskStartMinutes, taskStopMinutes);
        segment.beforeBreakHours = pos.beforeHours;
        segment.breakHours = pos.breakHours;
        segment.afterBreakHours = pos.afterHours;
      }

      return segment;
    });
  }, [tasks, colorByLabelId, liveTime, sanitizedTargetHours]);

  // Calculate total hours and percentage (break already deducted from durationHours)
  const totalHours = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.durationHours, 0),
    [segments],
  );

  const totalPercentage = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.percentage, 0),
    [segments],
  );

  // Include break hours in the visual total for normalization
  const totalBreakHours = useMemo(
    () => segments.reduce((sum, segment) => sum + (segment.breakHours ?? 0), 0),
    [segments],
  );
  const visualTotalPercentage = totalPercentage + (totalBreakHours / sanitizedTargetHours) * 100;
  const normalizationFactor = visualTotalPercentage > 100 ? 100 / visualTotalPercentage : 1;

  const isOvertime = totalPercentage > 100;
  const hasBreakSegments = segments.some((s) => s.includesBreak);

  // Position of the "Now" line mapped to the same rendered timeline scale as the segments.
  // This avoids drifting into task gaps or clamping before compressed overtime segments.
  const nowPct = useMemo(() => {
    if (!isToday || !liveTime || tasks.length === 0) return null;

    const sortedTasks = [...tasks].sort(
      (a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf(),
    );

    let elapsedVisualHours = 0;

    for (const task of sortedTasks) {
      const taskStart = dayjs(task.startTime);
      const taskStop = dayjs(task.stopTime ?? liveTime);

      if (!liveTime.isAfter(taskStart)) break;
      if (!taskStop.isAfter(taskStart)) continue;

      const intervalEnd = liveTime.isBefore(taskStop) ? liveTime : taskStop;
      const overlapHours = intervalEnd.diff(taskStart, "hour", true);

      if (overlapHours > 0) {
        elapsedVisualHours += overlapHours;
      }
    }

    const scaledPct = (elapsedVisualHours / sanitizedTargetHours) * 100 * normalizationFactor;
    return Math.max(0, Math.min(scaledPct, 100));
  }, [isToday, liveTime, tasks, sanitizedTargetHours, normalizationFactor]);

  return (
    <div className="my-3">
      {/* Stacked Progress Bar */}
      {segments.length > 0 ? (
        <div style={{ position: "relative" }}>
          <BootstrapProgressBar>
          {segments.map((segment) => {
            const tooltipText = `${segment.text}: ${segment.durationHours.toFixed(2)}h`;
            // For segments with a break, render three sub-segments positioned
            // according to where the break falls within the lunch window.
            if (
              segment.includesBreak &&
              segment.breakHours != null &&
              segment.beforeBreakHours != null &&
              segment.afterBreakHours != null
            ) {
              const beforePct =
                (segment.beforeBreakHours / sanitizedTargetHours) * 100 * normalizationFactor;
              const breakPct =
                (segment.breakHours / sanitizedTargetHours) * 100 * normalizationFactor;
              const afterPct =
                (segment.afterBreakHours / sanitizedTargetHours) * 100 * normalizationFactor;

              // Show label on whichever work portion is larger
              const showLabelOnBefore = beforePct >= afterPct;
              const labelOnBefore = showLabelOnBefore && beforePct > 10;
              const labelOnAfter = !showLabelOnBefore && afterPct > 10;

              const parts: React.ReactNode[] = [];

              if (beforePct > 0) {
                parts.push(
                  <BootstrapProgressBar
                    key={segment.id}
                    now={beforePct}
                    style={{ backgroundColor: segment.color, color: segment.textColor }}
                    title={tooltipText}
                    aria-label={tooltipText}
                    label={
                      labelOnBefore ? <span style={LABEL_STYLE}>{segment.text}</span> : undefined
                    }
                  />,
                );
              }

              parts.push(
                <BootstrapProgressBar
                  key={`${segment.id}-break`}
                  now={breakPct}
                  style={{ backgroundColor: segment.color, opacity: 0.3 }}
                  title={`Break: ${BREAK_DURATION_MINUTES}min`}
                  aria-label={`Break deduction: ${BREAK_DURATION_MINUTES} minutes`}
                  data-testid={`break-segment-${segment.id}`}
                />,
              );

              if (afterPct > 0) {
                parts.push(
                  <BootstrapProgressBar
                    key={`${segment.id}-after`}
                    now={afterPct}
                    style={{ backgroundColor: segment.color, color: segment.textColor }}
                    title={tooltipText}
                    aria-label={tooltipText}
                    label={
                      labelOnAfter ? <span style={LABEL_STYLE}>{segment.text}</span> : undefined
                    }
                  />,
                );
              }

              return parts;
            }

            // Regular segment (no break)
            const normalizedPercent = segment.percentage * normalizationFactor;
            return (
              <BootstrapProgressBar
                key={segment.id}
                now={normalizedPercent}
                style={{ backgroundColor: segment.color, color: segment.textColor }}
                title={tooltipText}
                aria-label={tooltipText}
                label={
                  normalizedPercent > 10 ? (
                    <span style={LABEL_STYLE}>{segment.text}</span>
                  ) : undefined
                }
              />
            );
          })}
          </BootstrapProgressBar>
          {nowPct !== null && liveTime && (
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${nowPct}%`,
                width: "2px",
                backgroundColor: "var(--bs-danger)",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
              data-testid="now-line"
              aria-label={`Current time: ${liveTime.format("HH:mm")}`}
            />
          )}
        </div>
      ) : (
        <BootstrapProgressBar now={0} />
      )}

      {/* Break legend */}
      {hasBreakSegments && (
        <div className="text-muted mt-1 d-flex align-items-center" style={{ fontSize: "0.75rem" }}>
          <span
            style={{
              display: "inline-block",
              width: "12px",
              height: "12px",
              backgroundColor: "currentColor",
              opacity: 0.3,
              borderRadius: "2px",
              marginRight: "0.35rem",
            }}
          />
          Break ({BREAK_DURATION_MINUTES}min)
        </div>
      )}

      {/* Summary text */}
      <div className="text-muted mt-2 d-flex justify-content-between align-items-center">
        <span data-testid="timeline-total-duration">
          {totalHours.toFixed(2)}h ({totalPercentage.toFixed(1)}%)
        </span>
        {isOvertime && (
          <span className="badge bg-warning text-dark">
            Overtime: +{(totalHours - sanitizedTargetHours).toFixed(2)}h
          </span>
        )}
      </div>
    </div>
  );
}
