/**
 * Represents information about a school holiday.
 *
 * Used as a value in Map<string, SchoolHolidayInfo> where the key is the date string (YYYY/MM/DD format).
 * This allows efficient lookup of holiday information for any given date.
 *
 * @example
 * const schoolHolidays = new Map<string, SchoolHolidayInfo>();
 * schoolHolidays.set("2025/12/25", {
 *   name: "Christmas Holiday",
 *   localName: "Kerstvakantie"
 * });
 */
export interface SchoolHolidayInfo {
  /**
   * Official name of the school holiday in English.
   * Used as the primary identifier and for accessibility labels.
   */
  name: string;

  /**
   * Localized name of the holiday in the local language.
   * Displayed to users as the primary label in tooltips and UI elements.
   */
  localName: string;
}
