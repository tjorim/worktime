import BootstrapProgressBar from "react-bootstrap/ProgressBar";

type ProgressBarProps = {
  hours: number;
  targetHours?: number;
};

export function ProgressBar({ hours, targetHours = 8.5 }: ProgressBarProps) {
  const percentage = (hours / targetHours) * 100;
  const variant = percentage > 100 ? "warning" : "success";
  return (
    <div className="my-3">
      <BootstrapProgressBar now={percentage} variant={variant} />
      <div className="text-muted mt-2">
        {hours.toFixed(2)}h ({percentage.toFixed(1)}%)
      </div>
    </div>
  );
}
