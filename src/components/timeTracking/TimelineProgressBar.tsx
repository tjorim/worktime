import { useMemo } from "react";
import BootstrapProgressBar from "react-bootstrap/ProgressBar";
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
        percentage: (Math.max(0, durationHours) / sanitizedTargetHours) * 100,
      };
    });
  }, [tasks, colorByLabelId, liveTime, sanitizedTargetHours]);

  // Calculate total hours
  const totalHours = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.durationHours, 0),
    [segments],
  );

  const totalPercentage = (totalHours / sanitizedTargetHours) * 100;
  const isOvertime = totalPercentage > 100;

  return (
    <div className="my-3">
      {/* Stacked Progress Bar */}
      {segments.length > 0 ? (
        <BootstrapProgressBar>
          {segments.map((segment) => (
            <BootstrapProgressBar
              key={segment.id}
              now={Math.min(segment.percentage, 100)}
              style={{
                backgroundColor: segment.color,
                color: segment.textColor,
              }}
              label={
                segment.percentage > 10 ? (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      padding: "0 0.25rem",
                    }}
                    title={`${segment.text}: ${segment.durationHours.toFixed(2)}h`}
                  >
                    {segment.text}
                  </span>
                ) : undefined
              }
            />
          ))}
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
