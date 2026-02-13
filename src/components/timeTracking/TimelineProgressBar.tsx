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
import { BREAK_DURATION_MINUTES, effectiveDurationHours } from "./timeUtils";

const DEFAULT_TARGET_HOURS = 8;

type TimelineProgressBarProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  targetHours?: number;
  liveTime?: dayjs.Dayjs;
};

type TaskSegment = {
  id: string;
  text: string;
  color: string;
  textColor: string;
  durationHours: number;
  percentage: number;
  includesBreak?: boolean;
  breakPercentage?: number;
};

export function TimelineProgressBar({
  tasks,
  labels,
  targetHours = DEFAULT_TARGET_HOURS,
  liveTime,
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

      const breakHours = task.includesBreak
        ? Math.min(BREAK_DURATION_MINUTES / 60, rawDurationHours)
        : 0;

      return {
        id: task.id,
        text: task.text,
        color,
        textColor,
        durationHours,
        percentage: (durationHours / sanitizedTargetHours) * 100,
        includesBreak: task.includesBreak,
        breakPercentage: breakHours > 0 ? (breakHours / sanitizedTargetHours) * 100 : undefined,
      };
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

  // Include break percentages in the visual total for normalization
  const totalBreakPercentage = useMemo(
    () => segments.reduce((sum, segment) => sum + (segment.breakPercentage ?? 0), 0),
    [segments],
  );
  const visualTotalPercentage = totalPercentage + totalBreakPercentage;

  const isOvertime = totalPercentage > 100;

  return (
    <div className="my-3">
      {/* Stacked Progress Bar */}
      {segments.length > 0 ? (
        <BootstrapProgressBar>
          {segments.map((segment) => {
            // Normalize segment width if total exceeds 100%
            const normalizedPercent =
              visualTotalPercentage > 100
                ? (segment.percentage / visualTotalPercentage) * 100
                : segment.percentage;

            const tooltipText = `${segment.text}: ${segment.durationHours.toFixed(2)}h`;

            // For segments that include break, render the work portion then a break slice
            if (segment.includesBreak && segment.breakPercentage) {
              const normalizedBreakPercent =
                visualTotalPercentage > 100
                  ? (segment.breakPercentage / visualTotalPercentage) * 100
                  : segment.breakPercentage;

              return [
                <BootstrapProgressBar
                  key={segment.id}
                  now={normalizedPercent}
                  style={{
                    backgroundColor: segment.color,
                    color: segment.textColor,
                  }}
                  title={tooltipText}
                  aria-label={tooltipText}
                  label={
                    normalizedPercent > 10 ? (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          padding: "0 0.25rem",
                        }}
                      >
                        {segment.text}
                      </span>
                    ) : undefined
                  }
                />,
                <BootstrapProgressBar
                  key={`${segment.id}-break`}
                  now={normalizedBreakPercent}
                  style={{
                    backgroundColor: segment.color,
                    opacity: 0.3,
                  }}
                  title={`Break: ${BREAK_DURATION_MINUTES}min`}
                  aria-label={`Break deduction: ${BREAK_DURATION_MINUTES} minutes`}
                />,
              ];
            }

            return (
              <BootstrapProgressBar
                key={segment.id}
                now={normalizedPercent}
                style={{
                  backgroundColor: segment.color,
                  color: segment.textColor,
                }}
                title={tooltipText}
                aria-label={tooltipText}
                label={
                  normalizedPercent > 10 ? (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        padding: "0 0.25rem",
                      }}
                    >
                      {segment.text}
                    </span>
                  ) : undefined
                }
              />
            );
          })}
        </BootstrapProgressBar>
      ) : (
        <BootstrapProgressBar now={0} />
      )}

      {/* Summary text */}
      <div className="text-muted mt-2 d-flex justify-content-between align-items-center">
        <span>
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
