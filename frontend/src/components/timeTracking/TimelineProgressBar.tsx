import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import Overlay from "react-bootstrap/Overlay";
import BootstrapProgressBar from "react-bootstrap/ProgressBar";
import Tooltip from "react-bootstrap/Tooltip";
import { dayjs } from "@/utils/dateTimeUtils";
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
  liveTime?: Dayjs;
  /** Whether the selected date is today. Shows the Now line when true. */
  isToday?: boolean;
};

type TaskSegment = {
  type: "task";
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

type GapSegment = {
  type: "gap";
  id: string;
  durationHours: number;
  percentage: number;
};

type RenderSegment = TaskSegment | GapSegment;

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
  const sanitizedTargetHours =
    Number.isFinite(targetHours) && targetHours > 0 ? targetHours : DEFAULT_TARGET_HOURS;

  const colorByLabelId = useMemo(() => buildLabelColorMap(labels), [labels]);

  const [tooltipInfo, setTooltipInfo] = useState<{
    label: string;
    target: HTMLElement;
  } | null>(null);

  const showTooltip = (label: string) => (e: React.MouseEvent<HTMLElement>) =>
    setTooltipInfo({ label, target: e.currentTarget });
  const hideTooltip = () => setTooltipInfo(null);

  const renderSegments = useMemo<RenderSegment[]>(() => {
    const result: RenderSegment[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task) continue;

      const startDayjs = dayjs(task.startTime);
      const stopDayjs = task.stopTime ? dayjs(task.stopTime) : (liveTime ?? dayjs());
      const rawDurationHours = Math.max(stopDayjs.diff(startDayjs, "hour", true), 0);
      const durationHours = effectiveDurationHours(rawDurationHours, task.includesBreak);
      const color = colorByLabelId[task.label] ?? getDefaultLabelColor();
      const textColor = getContrastingTextColor(color);

      const segment: TaskSegment = {
        type: "task",
        id: task.id,
        text: task.text,
        color,
        textColor,
        durationHours,
        percentage: (durationHours / sanitizedTargetHours) * 100,
        includesBreak: task.includesBreak,
      };

      if (task.includesBreak && rawDurationHours > 0) {
        const taskStartMinutes = startDayjs.hour() * 60 + startDayjs.minute();
        const taskStopMinutes = stopDayjs.hour() * 60 + stopDayjs.minute();
        const pos = calculateBreakPosition(taskStartMinutes, taskStopMinutes);
        segment.beforeBreakHours = pos.beforeHours;
        segment.breakHours = pos.breakHours;
        segment.afterBreakHours = pos.afterHours;
      }

      result.push(segment);

      // Insert a gap segment between this task and the next.
      const next = tasks[i + 1];
      if (task.stopTime && next?.startTime) {
        const gapHours = dayjs(next.startTime).diff(dayjs(task.stopTime), "hour", true);
        if (gapHours > 0) {
          result.push({
            type: "gap",
            id: `gap-${task.id}`,
            durationHours: gapHours,
            percentage: (gapHours / sanitizedTargetHours) * 100,
          });
        }
      }
    }

    return result;
  }, [tasks, colorByLabelId, liveTime, sanitizedTargetHours]);

  const totalHours = useMemo(
    () =>
      renderSegments
        .filter((s): s is TaskSegment => s.type === "task")
        .reduce((sum, s) => sum + s.durationHours, 0),
    [renderSegments],
  );

  const totalPercentage = useMemo(
    () =>
      renderSegments
        .filter((s): s is TaskSegment => s.type === "task")
        .reduce((sum, s) => sum + s.percentage, 0),
    [renderSegments],
  );

  const totalBreakHours = useMemo(
    () =>
      renderSegments
        .filter((s): s is TaskSegment => s.type === "task")
        .reduce((sum, s) => sum + (s.breakHours ?? 0), 0),
    [renderSegments],
  );

  const totalGapHours = useMemo(
    () =>
      renderSegments
        .filter((s): s is GapSegment => s.type === "gap")
        .reduce((sum, s) => sum + s.durationHours, 0),
    [renderSegments],
  );

  const visualTotalPercentage =
    totalPercentage +
    (totalBreakHours / sanitizedTargetHours) * 100 +
    (totalGapHours / sanitizedTargetHours) * 100;
  const normalizationFactor = visualTotalPercentage > 100 ? 100 / visualTotalPercentage : 1;

  const isOvertime = totalPercentage > 100;

  // Now line is positioned at wall-clock elapsed time from the first task's start,
  // so it accounts for gaps between tasks correctly.
  const nowPct = useMemo(() => {
    if (!isToday || !liveTime || tasks.length === 0) return null;
    const firstTask = tasks[0];
    if (!firstTask?.startTime) return null;
    const elapsedHours = liveTime.diff(dayjs(firstTask.startTime), "hour", true);
    const scaledPct = (elapsedHours / sanitizedTargetHours) * 100 * normalizationFactor;
    return Math.max(0, Math.min(scaledPct, 100));
  }, [isToday, liveTime, tasks, sanitizedTargetHours, normalizationFactor]);

  return (
    <div className="my-3">
      {renderSegments.length > 0 ? (
        <div style={{ position: "relative" }}>
          <BootstrapProgressBar>
            {renderSegments.map((rs) => {
              if (rs.type === "gap") {
                const gapLabel = `${Math.round(rs.durationHours * 60)} minutes untracked`;
                return (
                  <BootstrapProgressBar
                    key={rs.id}
                    now={rs.percentage * normalizationFactor}
                    style={{ backgroundColor: "var(--bs-secondary-bg-subtle, #e9ecef)" }}
                    aria-label={gapLabel}
                    onMouseEnter={showTooltip(gapLabel)}
                    onMouseLeave={hideTooltip}
                  />
                );
              }

              const tooltipText = `${rs.text}: ${rs.durationHours.toFixed(2)}h`;

              if (
                rs.includesBreak &&
                rs.breakHours != null &&
                rs.beforeBreakHours != null &&
                rs.afterBreakHours != null
              ) {
                const beforePct =
                  (rs.beforeBreakHours / sanitizedTargetHours) * 100 * normalizationFactor;
                const breakPct =
                  (rs.breakHours / sanitizedTargetHours) * 100 * normalizationFactor;
                const afterPct =
                  (rs.afterBreakHours / sanitizedTargetHours) * 100 * normalizationFactor;
                const breakTooltipText = `Break: ${BREAK_DURATION_MINUTES}min`;

                const showLabelOnBefore = beforePct >= afterPct;
                const labelOnBefore = showLabelOnBefore && beforePct > 10;
                const labelOnAfter = !showLabelOnBefore && afterPct > 10;

                const parts: React.ReactNode[] = [];

                if (beforePct > 0) {
                  parts.push(
                    <BootstrapProgressBar
                      key={rs.id}
                      now={beforePct}
                      style={{ backgroundColor: rs.color, color: rs.textColor }}
                      aria-label={tooltipText}
                      label={labelOnBefore ? <span style={LABEL_STYLE}>{rs.text}</span> : undefined}
                      onMouseEnter={showTooltip(tooltipText)}
                      onMouseLeave={hideTooltip}
                    />,
                  );
                }

                parts.push(
                  <BootstrapProgressBar
                    key={`${rs.id}-break`}
                    now={breakPct}
                    style={{ backgroundColor: rs.color, opacity: 0.3 }}
                    aria-label={`Break deduction: ${BREAK_DURATION_MINUTES} minutes`}
                    data-testid={`break-segment-${rs.id}`}
                    onMouseEnter={showTooltip(breakTooltipText)}
                    onMouseLeave={hideTooltip}
                  />,
                );

                if (afterPct > 0) {
                  parts.push(
                    <BootstrapProgressBar
                      key={`${rs.id}-after`}
                      now={afterPct}
                      style={{ backgroundColor: rs.color, color: rs.textColor }}
                      aria-label={tooltipText}
                      label={labelOnAfter ? <span style={LABEL_STYLE}>{rs.text}</span> : undefined}
                      onMouseEnter={showTooltip(tooltipText)}
                      onMouseLeave={hideTooltip}
                    />,
                  );
                }

                return parts;
              }

              const normalizedPercent = rs.percentage * normalizationFactor;
              return (
                <BootstrapProgressBar
                  key={rs.id}
                  now={normalizedPercent}
                  style={{ backgroundColor: rs.color, color: rs.textColor }}
                  aria-label={tooltipText}
                  label={
                    normalizedPercent > 10 ? (
                      <span style={LABEL_STYLE}>{rs.text}</span>
                    ) : undefined
                  }
                  onMouseEnter={showTooltip(tooltipText)}
                  onMouseLeave={hideTooltip}
                />
              );
            })}
          </BootstrapProgressBar>

          <Overlay show={tooltipInfo !== null} target={tooltipInfo?.target ?? null} placement="top">
            <Tooltip id="progress-bar-tooltip">{tooltipInfo?.label}</Tooltip>
          </Overlay>

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
