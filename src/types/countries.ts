/**
 * Branded type for validated ISO 3166-1 alpha-2 codes
 */
export type IsoAlpha2 = string & { readonly __isoAlpha2: unique symbol };
const countries = [
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "DE", name: "Germany" },
  { code: "LU", name: "Luxembourg" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
] as const;

/**
 * ISO 3166-1 alpha-2 country codes supported by Worktime.
 */
export type CountryCode = (typeof countries)[number]["code"];

/**
 * Represents a supported country with its ISO code and display name.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 country code */
  code: CountryCode;
  /** Human-readable country name */
  name: string;
}

/**
 * List of countries supported for home/office location tracking.
 * Includes the Benelux region and neighboring countries.
 */
export const SUPPORTED_COUNTRIES: readonly Country[] = countries;

const validCountryCodes = new Set<string>(SUPPORTED_COUNTRIES.map((c) => c.code));

/**
 * Returns true if the given value is a valid supported country code.
 */
export function isValidCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && validCountryCodes.has(value);
}

/**
 * Returns true for any 2-uppercase-letter ISO 3166-1 alpha-2 code.
 * Use this to validate free-text country codes for "other" work locations,
 * which may not be in the curated SUPPORTED_COUNTRIES list.
 */
export function isValidIsoAlpha2(value: unknown): value is IsoAlpha2 {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}
