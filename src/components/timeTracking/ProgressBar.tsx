import BootstrapProgressBar from "react-bootstrap/ProgressBar";

type ProgressBarProps = {
  hours: number;
  targetHours?: number;
};

export function ProgressBar({ hours, targetHours = 8.5 }: ProgressBarProps) {
  // Validate and sanitize targetHours: ensure it's > 0
  const sanitizedTargetHours = targetHours > 0 ? targetHours : 8.5;

  // Coerce negative hours to 0 and clamp within [0, targetHours]
  const sanitizedHours = Math.min(Math.max(hours, 0), sanitizedTargetHours);

  // Compute percentage from sanitized values
  const percentage = (sanitizedHours / sanitizedTargetHours) * 100;

  // Derive variant from safe percentage
  const variant = percentage > 100 ? "warning" : "success";

  return (
    <div className="my-3">
      <BootstrapProgressBar now={percentage} variant={variant} />
      <div className="text-muted mt-2">
        {sanitizedHours.toFixed(2)}h ({percentage.toFixed(1)}%)
      </div>
    </div>
  );
}
