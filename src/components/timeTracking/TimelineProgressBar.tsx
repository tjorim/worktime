import { useMemo } from "react";
import { dayjs } from "../../utils/dateTimeUtils";
import { getContrastingTextColor, type TimeTrackingLabel } from "./constants";
import type { StoredTimeTrackingTask } from "./types";

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
  targetHours = 8.5,
  liveTime,
}: TimelineProgressBarProps) {
  // Validate and sanitize targetHours: ensure it's finite and > 0
  const sanitizedTargetHours = Number.isFinite(targetHours) && targetHours > 0 ? targetHours : 8.5;

  // Build color map from labels
  const colorByLabelId = useMemo(
    () =>
      labels.reduce<Record<string, string>>((map, label) => {
        map[label.id] = label.color;
        return map;
      }, {}),
    [labels],
  );

  // Calculate segments for each task
  const segments = useMemo<TaskSegment[]>(() => {
    return tasks.map((task) => {
      const startDayjs = dayjs(task.startTime);
      const stopDayjs = task.stopTime ? dayjs(task.stopTime) : liveTime ?? dayjs();
      const durationHours = stopDayjs.diff(startDayjs, "hour", true);
      const color = colorByLabelId[task.label] ?? "#6c757d";
      const textColor = getContrastingTextColor(color);

      return {
        id: task.id,
        text: task.text,
        color,
        textColor,
        durationHours: Math.max(0, durationHours),
        percentage: 0, // Will be calculated below
      };
    });
  }, [tasks, colorByLabelId, liveTime]);

  // Calculate total hours and percentages
  const totalHours = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.durationHours, 0),
    [segments],
  );

  // Update percentages based on target hours
  const segmentsWithPercentage = useMemo(
    () =>
      segments.map((segment) => ({
        ...segment,
        percentage: (segment.durationHours / sanitizedTargetHours) * 100,
      })),
    [segments, sanitizedTargetHours],
  );

  // Calculate cumulative percentages for positioning
  const segmentsWithPosition = useMemo(() => {
    let cumulativePercentage = 0;
    return segmentsWithPercentage.map((segment) => {
      const startPercentage = cumulativePercentage;
      cumulativePercentage += segment.percentage;
      return {
        ...segment,
        startPercentage,
        endPercentage: cumulativePercentage,
      };
    });
  }, [segmentsWithPercentage]);

  const totalPercentage = (totalHours / sanitizedTargetHours) * 100;
  const isOvertime = totalPercentage > 100;

  return (
    <div className="my-3">
      <div className="position-relative" style={{ height: "24px" }}>
        {/* Background bar */}
        <div
          className="position-absolute top-0 start-0 w-100 h-100 rounded"
          style={{
            backgroundColor: "var(--bs-secondary-bg)",
            border: "1px solid var(--bs-border-color)",
          }}
        />

        {/* Target hours guideline (at 100%) */}
        <div
          className="position-absolute top-0 h-100"
          style={{
            left: "100%",
            width: "2px",
            backgroundColor: "var(--bs-primary)",
            opacity: 0.7,
            zIndex: 10,
          }}
          title={`Target: ${sanitizedTargetHours}h`}
        />

        {/* Task segments */}
        {segmentsWithPosition.map((segment) => {
          // Clamp to max 100% for display
          const displayStartPercentage = Math.min(segment.startPercentage, 100);
          const displayEndPercentage = Math.min(segment.endPercentage, 100);
          const displayWidth = displayEndPercentage - displayStartPercentage;

          // Don't render if segment is entirely beyond 100%
          if (displayWidth <= 0) {
            return null;
          }

          return (
            <div
              key={segment.id}
              className="position-absolute top-0 h-100 d-flex align-items-center justify-content-center"
              style={{
                left: `${displayStartPercentage}%`,
                width: `${displayWidth}%`,
                backgroundColor: segment.color,
                color: segment.textColor,
                fontSize: "0.7rem",
                fontWeight: 600,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                padding: "0 0.25rem",
                borderRight: "1px solid rgb(255 255 255 / 20%)",
              }}
              title={`${segment.text}: ${segment.durationHours.toFixed(2)}h`}
            >
              {/* Only show text if segment is wide enough */}
              {displayWidth > 10 && (
                <span className="text-truncate">{segment.text}</span>
              )}
            </div>
          );
        })}
      </div>

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
