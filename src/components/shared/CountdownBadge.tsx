import Badge from "react-bootstrap/Badge";
import type { Dayjs } from "dayjs";
import type { CountdownResult } from "../../hooks/useCountdown";

interface CountdownBadgeProps {
  countdown: CountdownResult | null;
  startTime: Dayjs | null;
  variant?: "info" | "warning" | "success";
  showIcon?: boolean;
  className?: string;
}

/**
 * Reusable countdown badge component for displaying time until next shift.
 *
 * @param countdown - Countdown result from useCountdown hook
 * @param startTime - The target start time
 * @param variant - Bootstrap badge variant (default: "info")
 * @param showIcon - Whether to show clock icon (default: true)
 * @param className - Additional CSS classes (default: "mt-2")
 * @returns Badge with countdown or null if countdown expired/invalid
 */
export function CountdownBadge({
  countdown,
  startTime,
  variant = "info",
  showIcon = true,
  className = "mt-2",
}: CountdownBadgeProps) {
  // Only show if we have valid countdown data
  if (!countdown || countdown.isExpired || !startTime) {
    return null;
  }

  return (
    <Badge bg={variant} className={className}>
      {showIcon && <span aria-hidden="true">⏰ </span>}Starts in {countdown.formatted}
    </Badge>
  );
}
