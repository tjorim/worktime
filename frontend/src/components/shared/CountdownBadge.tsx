const TWO_HOURS_IN_SECONDS = 7200;
const ONE_DAY_IN_SECONDS = 86400;
import Badge from "react-bootstrap/Badge";
import type { Dayjs } from "dayjs";
import type { CountdownResult } from "@/hooks/useCountdown";

interface CountdownBadgeProps {
  countdown: CountdownResult | null;
  startTime: Dayjs | null;
  label?: string;
  variant?: "info" | "warning" | "success";
  urgency?: boolean;
  showIcon?: boolean;
  className?: string;
}

/**
 * Reusable countdown badge component for displaying time remaining.
 *
 * @param countdown - Countdown result from useCountdown hook
 * @param startTime - The target time
 * @param label - Text label before the countdown (default: "Starts in")
 * @param variant - Bootstrap badge variant (default: "info")
 * @param urgency - Auto-select variant based on remaining time (overrides variant)
 * @param showIcon - Whether to show clock icon (default: true)
 * @param className - Additional CSS classes (default: "mt-2")
 * @returns Badge with countdown or null if countdown expired/invalid
 */
export function CountdownBadge({
  countdown,
  startTime,
  label = "Starts in",
  variant = "info",
  urgency = false,
  showIcon = true,
  className = "mt-2",
}: CountdownBadgeProps) {
  // Only show if we have valid countdown data
  if (!countdown || countdown.isExpired || !startTime) {
    return null;
  }

  let resolvedVariant = variant;
  if (urgency) {
    if (countdown.totalSeconds < TWO_HOURS_IN_SECONDS) {
      resolvedVariant = "warning";
    } else if (countdown.totalSeconds > ONE_DAY_IN_SECONDS) {
      resolvedVariant = "success";
    } else {
      resolvedVariant = "info";
    }
  }

  return (
    <Badge bg={resolvedVariant} className={className}>
      {showIcon && <span aria-hidden="true">⏰ </span>}
      {label} {countdown.formatted}
    </Badge>
  );
}
