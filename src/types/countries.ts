/**
 * ISO 3166-1 alpha-2 country codes supported by Worktime.
 */
export type CountryCode = "NL" | "BE" | "DE" | "LU" | "FR" | "GB";

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
export const SUPPORTED_COUNTRIES: readonly Country[] = [
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "DE", name: "Germany" },
  { code: "LU", name: "Luxembourg" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
];

const validCountryCodes = new Set<string>(SUPPORTED_COUNTRIES.map((c) => c.code));

/**
 * Returns true if the given value is a valid supported country code.
 */
export function isValidCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && validCountryCodes.has(value);
}
