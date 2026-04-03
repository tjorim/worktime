import BootstrapProgressBar from "react-bootstrap/ProgressBar";

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

  // Derive variant from raw percentage to allow overtime state
  const variant = percentage > 100 ? "warning" : "success";

  return (
    <div className="my-3">
      <BootstrapProgressBar now={clampedPercentage} variant={variant} />
      <div className="text-muted mt-2">
        {rawHours.toFixed(2)}h ({percentage.toFixed(1)}%)
      </div>
    </div>
  );
}
