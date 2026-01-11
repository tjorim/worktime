import { useSettings } from "../contexts/SettingsContext";
import { getScheduleConfig } from "../utils/scheduleUtils";

export function useScheduleConfig() {
  const { scheduleType } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const isFiveShift = scheduleConfig.value === "5-shift";

  return { scheduleConfig, isFiveShift, scheduleType };
}
