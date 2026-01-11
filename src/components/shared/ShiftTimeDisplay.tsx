import type { ShiftResult } from "../../utils/shiftCalculations";
import type { ScheduleOption } from "../../data/rosters";
import { getFormattedShiftTime } from "../../utils/shiftCalculations";
import { useSettings } from "../../contexts/SettingsContext";

interface ShiftTimeDisplayProps {
  shift: ShiftResult["shift"];
  scheduleType?: ScheduleOption | null;
  timeFormat?: "12h" | "24h";
  className?: string;
}

/**
 * Reusable shift time display component with schedule-aware formatting.
 *
 * @param shift - Shift object with start/end times
 * @param scheduleType - Optional schedule type for display overrides
 * @param timeFormat - Time format preference (defaults to user setting)
 * @param className - Additional CSS classes (default: "small text-muted")
 * @returns Formatted shift time display
 */
export function ShiftTimeDisplay({
  shift,
  scheduleType,
  timeFormat,
  className = "small text-muted",
}: ShiftTimeDisplayProps) {
  const { settings } = useSettings();
  const effectiveTimeFormat = timeFormat || settings.timeFormat;
  const formattedTime = getFormattedShiftTime(shift, scheduleType, effectiveTimeFormat);

  return <div className={className}>{formattedTime}</div>;
}
