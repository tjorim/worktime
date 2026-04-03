import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { dayjs } from "../utils/dateTimeUtils";

const DEFAULT_INTERVALS = {
  SECOND: 1000,
  MINUTE: 60000,
} as const;

export type LiveTimeOptions = {
  /** Update interval in milliseconds. Defaults to 60000 (1 minute) for better performance */
  updateInterval?: number;
  /** Precision level - affects default update interval */
  precision?: "second" | "minute";
};

/**
 * Hook that provides live updating time with configurable update frequency
 *
 * @param options Configuration options for update frequency
 * @returns Current time as Dayjs object, updated at specified interval
 *
 * @example
 * // Update every minute (default, better performance)
 * const time = useLiveTime();
 *
 * @example
 * // Update every second for precise timing
 * const time = useLiveTime({ precision: 'second' });
 *
 * @example
 * // Custom interval
 * const time = useLiveTime({ updateInterval: 5000 }); // Every 5 seconds
 */
export function useLiveTime(options: LiveTimeOptions = {}): Dayjs {
  const { precision = "minute", updateInterval } = options;

  // Default intervals based on precision
  const defaultInterval =
    precision === "second" ? DEFAULT_INTERVALS.SECOND : DEFAULT_INTERVALS.MINUTE;
  const interval = updateInterval ?? defaultInterval;

  const [currentTime, setCurrentTime] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return currentTime;
}
