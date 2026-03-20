/**
 * Represents information about a payday.
 *
 * Used as a value in Map<string, PaydayInfo> where the key is the date string (YYYY/MM/DD format).
 * This allows efficient lookup of payday information for any given date.
 *
 * Paydays are typically calculated based on a fixed day of the month (e.g., 25th),
 * adjusted for weekends and public holidays to fall on the nearest business day.
 *
 * @example
 * const paydays = new Map<string, PaydayInfo>();
 * paydays.set("2025/01/24", {
 *   name: "Payday"
 * });
 */
export type PaydayInfo = {
  /**
   * The label displayed for this payday.
   * Typically "Payday" but can be customized (e.g., "Salary Payment", "Monthly Pay").
   * Used in tooltips and UI elements to identify payday dates.
   */
  name: string;
};
