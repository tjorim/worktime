/**
 * Represents where a user is working from on a given day.
 *
 * - "home": Working from home (WFH)
 * - "office": Working from the office
 * - "other": Any other location (worldwide office, customer site, conference, etc.)
 */
export type WorkLocation = "home" | "office" | "other";

/**
 * Represents work location information for a specific day.
 *
 * Used as a value in Map<string, WorkLocationInfo> where the key is the date string (YYYY-MM-DD format).
 * This allows efficient lookup of work location information for any given date.
 *
 * @example
 * const workLocations = new Map<string, WorkLocationInfo>();
 * workLocations.set("2026-02-20", {
 *   location: "home",
 *   countryCode: "NL"
 * });
 *
 * @note The countryCode is captured at write time from the caller-supplied value or settings.
 * Changing homeCountry/officeCountry later does not retroactively update historical entries.
 */
export interface WorkLocationInfo {
  /**
   * Where the user is working from on this day.
   */
  location: WorkLocation;

  /**
   * ISO 3166-1 alpha-2 country code for the work location (any 2 uppercase letters).
   * Captured at write time — changing country settings does not retroactively update stored entries.
   * Used for tax/regulatory compliance when working across borders.
   */

  countryCode: CountryCode;

  /**
   * Optional free-text annotation for "other" locations (e.g. "Berlin office", "Client NL").
   */
  label?: string;
}

/**
 * ISO 3166-1 alpha-2 country code type: two uppercase letters
 */
export type CountryCode = `${Uppercase<string>}${Uppercase<string>}`;

/**
 * Map of work locations keyed by date string (YYYY-MM-DD format).
 * Contains only explicitly set locations; days without an entry use the default (office).
 */
export type WorkLocationMap = Map<string, WorkLocationInfo>;
