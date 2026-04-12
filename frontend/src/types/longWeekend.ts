/** A long weekend period returned by the Nager.Date API. */
export interface LongWeekend {
  startDate: string;
  endDate: string;
  dayCount: number;
  needBridgeDay: boolean;
  bridgeDays: string[];
}

/**
 * Per-day information derived from a long weekend period.
 * Stored in the longWeekendMap keyed on YYYY-MM-DD date strings.
 */
export interface LongWeekendDayInfo {
  /** True when this day is a bridge day (a workday that must be taken as PTO). */
  isBridgeDay: boolean;
  /** Total number of days in the long weekend period this day belongs to. */
  dayCount: number;
}
