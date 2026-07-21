import type { Dayjs } from "dayjs";
import { setTimeFromFractionalHour } from "@/utils/dateTimeUtils";

/**
 * A resolved flex-time window: the employee may clock in any time between
 * `earliestStart` and `latestStart` (fractional hours) and is present for
 * `presenceHours` from their actual start.
 */
export interface FlexWindow {
  earliestStart: number;
  latestStart: number;
  presenceHours: number;
}

/** Structural subset of a shift/roster definition carrying flex-time fields. */
export interface FlexShiftFields {
  flexStartEarliest?: number;
  flexStartLatest?: number;
  presenceHours?: number;
}

/**
 * Returns the flex window for a shift definition, or `null` when the shift
 * does not define one (i.e. it is a fixed-time shift).
 */
export function getFlexWindow(shift: FlexShiftFields | null): FlexWindow | null {
  if (!shift) return null;
  const { flexStartEarliest, flexStartLatest, presenceHours } = shift;
  if (flexStartEarliest == null || flexStartLatest == null || presenceHours == null) {
    return null;
  }
  return {
    earliestStart: flexStartEarliest,
    latestStart: flexStartLatest,
    presenceHours,
  };
}

/**
 * Computes the finish time for a flex shift given an actual start time.
 * The presence duration is applied as a flat span (work + break combined),
 * so the finish moves one-for-one with the start and never changes shape
 * partway through the day.
 */
export function getFlexEndFromStart(startTime: Dayjs, presenceHours: number): Dayjs {
  return startTime.add(Math.round(presenceHours * 60), "minute");
}

/**
 * Computes the earliest and latest possible finish times for a flex shift on
 * a given day, based on the flex start window. Used when the actual clock-in
 * time is unknown, so the card can show a realistic leave range instead of a
 * single (wrong) countdown.
 */
export function getFlexEndRange(
  date: Dayjs,
  window: FlexWindow,
): { earliestEnd: Dayjs; latestEnd: Dayjs } {
  const earliestStartTime = setTimeFromFractionalHour(date, window.earliestStart);
  const latestStartTime = setTimeFromFractionalHour(date, window.latestStart);
  return {
    earliestEnd: getFlexEndFromStart(earliestStartTime, window.presenceHours),
    latestEnd: getFlexEndFromStart(latestStartTime, window.presenceHours),
  };
}
