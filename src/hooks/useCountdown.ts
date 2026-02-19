import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import { useLiveTime } from "./useLiveTime";

export interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
  formatted: string;
}

/**
 * Compute the remaining time until a target Dayjs date.
 *
 * @param targetDate - The date to count down to; pass `null` to indicate no target (treated as expired)
 * @returns A CountdownResult containing `days`, `hours`, `minutes`, `seconds`, `totalSeconds`, `formatted`, and `isExpired`. When `targetDate` is `null`, invalid, or in the past, `isExpired` is `true`, numeric fields are zero and `formatted` is an empty string.
 *
 * @example
 * // 2 days, 5 hours, 30 minutes from now
 * const target = dayjs().add(2, 'day').add(5, 'hour').add(30, 'minute');
 * calculateTimeLeft(target)
 * // Returns: { days: 2, hours: 5, minutes: 30, seconds: 0, isExpired: false, totalSeconds: 192600, formatted: "2d 5h 30m" }
 *
 * @example
 * // Past date
 * calculateTimeLeft(dayjs().subtract(1, 'hour'))
 * // Returns: { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0, formatted: "" }
 */
function calculateTimeLeft(targetDate: Dayjs | null, currentTime: Dayjs): CountdownResult {
  if (!targetDate || !targetDate.isValid()) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
      formatted: "",
    };
  }

  const diff = targetDate.diff(currentTime, "second");

  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
      formatted: "",
    };
  }

  const days = Math.floor(diff / (24 * 60 * 60));
  const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((diff % (60 * 60)) / 60);
  const seconds = diff % 60;

  let formatted = "";
  if (days > 0) {
    formatted = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    formatted = `${minutes}m ${seconds}s`;
  } else {
    formatted = `${seconds}s`;
  }

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    totalSeconds: diff,
    formatted,
  };
}

/**
 * Provide a live-updating countdown to a specified target date.
 *
 * @param targetDate - The date and time to count down to, or `null` to indicate an expired countdown
 * @param updateInterval - Update frequency in milliseconds (default 1000)
 * @returns The current countdown state: `days`, `hours`, `minutes`, `seconds`, `isExpired`, `totalSeconds` and `formatted`
 *
 * @example
 * // In a React component - countdown to next shift
 * function ShiftCountdown({ nextShiftDate }) {
 *   const countdown = useCountdown(nextShiftDate);
 *
 *   if (countdown.isExpired) {
 *     return <div>Shift has started!</div>;
 *   }
 *
 *   return <div>Next shift in: {countdown.formatted}</div>;
 *   // Displays: "Next shift in: 2d 5h 30m" (auto-updates every second)
 * }
 */
export function useCountdown(
  targetDate: Dayjs | null,
  updateInterval: number = 1000,
): CountdownResult {
  const liveTime = useLiveTime({ updateInterval });

  const timeLeft = useMemo(
    () => calculateTimeLeft(targetDate, liveTime),
    [targetDate, liveTime],
  );

  return timeLeft;
}
