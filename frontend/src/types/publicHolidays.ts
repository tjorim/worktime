/**
 * Represents information about a public holiday.
 *
 * Used as a value in Map<string, PublicHolidayInfo> where the key is the date string (YYYY/MM/DD format).
 * This allows efficient lookup of holiday information for any given date.
 *
 * @example
 * const publicHolidays = new Map<string, PublicHolidayInfo>();
 * publicHolidays.set("2025/01/01", {
 *   name: "New Year's Day",
 *   localName: "Nieuwjaar"
 * });
 */
export interface PublicHolidayInfo {
  /**
   * Official name of the public holiday in English.
   * Used as the primary identifier and for accessibility labels.
   */
  name: string;

  /**
   * Localized name of the holiday in the local language.
   * Displayed to users as the primary label in tooltips and UI elements.
   */
  localName: string;
}
