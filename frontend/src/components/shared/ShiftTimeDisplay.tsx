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
 * @param className - Additional CSS classes (default: "tw:text-sm tw:text-muted-foreground")
 * @returns Formatted shift time display
 */
export function ShiftTimeDisplay({
  shift,
  className = "tw:text-sm tw:text-muted-foreground",
}: ShiftTimeDisplayProps) {
  const formattedTime = useFormattedShiftTime(shift);

  return <div className={className}>{formattedTime}</div>;
}
