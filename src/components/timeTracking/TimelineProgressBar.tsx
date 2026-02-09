import { useMemo } from "react";
import BootstrapProgressBar from "react-bootstrap/ProgressBar";
import { dayjs } from "../../utils/dateTimeUtils";
import { buildLabelColorMap, getContrastingTextColor, getDefaultLabelColor, type TimeTrackingLabel } from "./constants";
import type { StoredTimeTrackingTask } from "./types";

const DEFAULT_TARGET_HOURS = 8.5;

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
      const durationHours = stopDayjs.diff(startDayjs, "hour", true);
      const nonNegativeDurationHours = Math.max(0, durationHours);
      const color = colorByLabelId[task.label] ?? getDefaultLabelColor();
      const textColor = getContrastingTextColor(color);

      return {
        id: task.id,
        text: task.text,
        color,
        textColor,
        durationHours: nonNegativeDurationHours,
        percentage: (nonNegativeDurationHours / sanitizedTargetHours) * 100,
      };
    });
  }, [tasks, colorByLabelId, liveTime, sanitizedTargetHours]);

  // Calculate total hours and percentage
  const totalHours = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.durationHours, 0),
    [segments],
  );

  const totalPercentage = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.percentage, 0),
    [segments],
  );

  const isOvertime = totalPercentage > 100;

  return (
    <div className="my-3">
      {/* Stacked Progress Bar */}
      {segments.length > 0 ? (
        <BootstrapProgressBar>
          {segments.map((segment) => {
            // Normalize segment width if total exceeds 100%
            const normalizedPercent =
              totalPercentage > 100
                ? (segment.percentage / totalPercentage) * 100
                : segment.percentage;

            const tooltipText = `${segment.text}: ${segment.durationHours.toFixed(2)}h`;

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
