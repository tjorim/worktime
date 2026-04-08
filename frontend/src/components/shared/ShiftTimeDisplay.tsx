import type { ShiftResult } from "@/utils/shiftCalculations";
import { useFormattedShiftTime } from "@/hooks/useFormattedShiftTime";

interface ShiftTimeDisplayProps {
  shift: ShiftResult["shift"];
  className?: string;
}

/**
 * Reusable shift time display component.
 *
 * @param shift - Shift object with start/end times
 * @param className - Additional CSS classes (default: "small text-muted")
 * @returns Formatted shift time display
 */
export function ShiftTimeDisplay({ shift, className = "small text-muted" }: ShiftTimeDisplayProps) {
  const formattedTime = useFormattedShiftTime(shift);

  return <div className={className}>{formattedTime}</div>;
}
