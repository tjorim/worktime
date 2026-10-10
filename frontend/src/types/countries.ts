import { getLocale } from "@/paraglide/runtime.js";

/**
 * Branded type for validated ISO 3166-1 alpha-2 codes
 */
export type IsoAlpha2 = string & { readonly __isoAlpha2: unique symbol };
const countryCodes = ["NL", "BE", "DE", "LU", "FR", "GB"] as const;

/**
 * ISO 3166-1 alpha-2 country codes supported by Worktime.
 */
export type CountryCode = (typeof countryCodes)[number];

/**
 * Represents a supported country with its ISO code and display name.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 country code */
  code: CountryCode;
  /** Country name in the selected interface language */
  name: string;
}

/**
 * List of countries supported for home/office location tracking.
 * Includes the Benelux region and neighboring countries.
 */
export const SUPPORTED_COUNTRIES: readonly Country[] = countryCodes.map((code) => ({
  code,
  get name() {
    return new Intl.DisplayNames([getLocale()], { type: "region" }).of(code) ?? code;
  },
}));

const validCountryCodes = new Set<string>(SUPPORTED_COUNTRIES.map((c) => c.code));

/**
 * Returns true if the given value is a valid supported country code.
 */
export function isValidCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && validCountryCodes.has(value);
}

/**
 * Returns true for any string matching the ISO 3166-1 alpha-2 format (two ASCII uppercase letters).
 * Format-only validation: does NOT check membership in the official ISO 3166-1 list.
 * Use for free-text country codes (e.g., "other" work locations).
 */
export function hasIsoAlpha2Format(value: unknown): value is IsoAlpha2 {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}
