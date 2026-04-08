import { useSettings } from "@/contexts/SettingsContext";
import { getFormattedShiftTime } from "@/utils/shiftCalculations";

/**
 * Hook to format shift time using the user's time format preference.
 *
 * @param shift - Shift object with start and end times
 * @returns Formatted shift time string (e.g., "7:00 AM - 3:00 PM" or "07:00-15:00")
 */
export function useFormattedShiftTime(shift: { start: number | null; end: number | null }): string {
  const { settings } = useSettings();
  return getFormattedShiftTime(shift, settings.timeFormat);
}
