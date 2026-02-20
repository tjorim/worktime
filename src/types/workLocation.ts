import type { CountryCode } from "./countries";

/**
 * Represents where a user is working from on a given day.
 *
 * - "home": Working from home (WFH)
 * - "office": Working from the office
 */
export type WorkLocation = "home" | "office";

/**
 * Represents work location information for a specific day.
 *
 * Used as a value in Map<string, WorkLocationInfo> where the key is the date string (YYYY/MM/DD format).
 * This allows efficient lookup of work location information for any given date.
 *
 * @example
 * const workLocations = new Map<string, WorkLocationInfo>();
 * workLocations.set("2026/02/20", {
 *   location: "home",
 *   countryCode: "NL"
 * });
 */
export interface WorkLocationInfo {
  /**
   * Where the user is working from on this day.
   * Used for WFH tracking and limit enforcement.
   */
  location: WorkLocation;

  /**
   * ISO 3166-1 alpha-2 country code for the work location.
   * Derived from the user's homeCountry (for WFH) or officeCountry (for office days) setting.
   * Used for tax/regulatory compliance when working across borders.
   */
  countryCode: CountryCode;
}

/**
 * Map of work locations keyed by date string (YYYY/MM/DD format).
 * Contains only explicitly set locations; days without an entry use the default (office).
 */
export type WorkLocationMap = Map<string, WorkLocationInfo>;
