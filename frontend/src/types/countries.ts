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
 * Retained for reading legacy work-location values; use isIsoCountryCode for new selections.
 */
export function hasIsoAlpha2Format(value: unknown): value is IsoAlpha2 {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

// ISO 3166-1 alpha-2; kept separate from the regional home/office options.
const isoCountryCodes: readonly string[] = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
];

export function isIsoCountryCode(value: unknown): value is IsoAlpha2 {
  return typeof value === "string" && isoCountryCodes.includes(value);
}

export function getIsoCountries() {
  const names = new Intl.DisplayNames([getLocale()], { type: "region" });
  return isoCountryCodes.map((code) => ({ code, name: names.of(code) ?? code }));
}
