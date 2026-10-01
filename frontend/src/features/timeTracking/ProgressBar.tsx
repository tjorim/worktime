import { Progress } from "@/components/ui/progress";

type ProgressBarProps = {
  hours: number;
  targetHours?: number;
};

export function ProgressBar({ hours, targetHours = 8 }: ProgressBarProps) {
  // Validate and sanitize targetHours: ensure it's finite and > 0
  const sanitizedTargetHours = Number.isFinite(targetHours) && targetHours > 0 ? targetHours : 8;

  // Normalize hours: guard against NaN and non-finite values
  const normalizedHours = Number.isFinite(hours) ? hours : 0;

  // Coerce negative hours to 0 for calculations and clamp for bar width
  const rawHours = Math.max(normalizedHours, 0);
  const sanitizedHours = Math.min(rawHours, sanitizedTargetHours);

  // Compute percentage from raw hours for overtime detection/display
  const percentage = (rawHours / sanitizedTargetHours) * 100;
  const clampedPercentage = (sanitizedHours / sanitizedTargetHours) * 100;

  // Overtime switches the indicator to the warning color
  const isOvertime = percentage > 100;

  return (
    <div className="tw:my-3">
      <Progress
        value={clampedPercentage}
        trackClassName="tw:h-4"
        indicatorClassName={isOvertime ? "tw:bg-warning-solid" : "tw:bg-success-solid"}
        data-overtime={isOvertime}
      />
      <div className="tw:mt-2 tw:text-muted-foreground">
        {rawHours.toFixed(2)}h ({percentage.toFixed(1)}%)
      </div>
    </div>
  );
}
