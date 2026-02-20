import { describe, expect, it } from "vitest";
import {
  type CountryCode,
  isValidCountryCode,
  SUPPORTED_COUNTRIES,
} from "../../src/types/countries";

describe("countries", () => {
  describe("SUPPORTED_COUNTRIES", () => {
    it("should include all expected countries", () => {
      const countryCodes = SUPPORTED_COUNTRIES.map((c) => c.code);
      expect(countryCodes).toContain("NL");
      expect(countryCodes).toContain("BE");
      expect(countryCodes).toContain("DE");
      expect(countryCodes).toContain("LU");
      expect(countryCodes).toContain("FR");
      expect(countryCodes).toContain("GB");
    });

    it("should have the correct structure for each country", () => {
      SUPPORTED_COUNTRIES.forEach((country) => {
        expect(country).toHaveProperty("code");
        expect(country).toHaveProperty("name");
        expect(typeof country.code).toBe("string");
        expect(typeof country.name).toBe("string");
        expect(country.code.length).toBe(2);
      });
    });

    it("should have unique country codes", () => {
      const codes = SUPPORTED_COUNTRIES.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it("should be immutable (readonly)", () => {
      // TypeScript enforces readonly at compile time, but we can verify the array exists
      expect(Array.isArray(SUPPORTED_COUNTRIES)).toBe(true);
      expect(SUPPORTED_COUNTRIES.length).toBeGreaterThan(0);
    });
  });

  describe("isValidCountryCode", () => {
    it("should return true for valid country codes", () => {
      expect(isValidCountryCode("NL")).toBe(true);
      expect(isValidCountryCode("BE")).toBe(true);
      expect(isValidCountryCode("DE")).toBe(true);
      expect(isValidCountryCode("LU")).toBe(true);
      expect(isValidCountryCode("FR")).toBe(true);
      expect(isValidCountryCode("GB")).toBe(true);
    });

    it("should return false for invalid country codes", () => {
      expect(isValidCountryCode("XX")).toBe(false);
      expect(isValidCountryCode("US")).toBe(false);
      expect(isValidCountryCode("CA")).toBe(false);
      expect(isValidCountryCode("INVALID")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidCountryCode(null)).toBe(false);
      expect(isValidCountryCode(undefined)).toBe(false);
      expect(isValidCountryCode(123)).toBe(false);
      expect(isValidCountryCode({})).toBe(false);
      expect(isValidCountryCode([])).toBe(false);
      expect(isValidCountryCode(true)).toBe(false);
    });

    it("should be case-sensitive", () => {
      expect(isValidCountryCode("nl")).toBe(false);
      expect(isValidCountryCode("Nl")).toBe(false);
      expect(isValidCountryCode("NL")).toBe(true);
    });

    it("should return false for empty string", () => {
      expect(isValidCountryCode("")).toBe(false);
    });

    it("should return false for whitespace-only strings", () => {
      expect(isValidCountryCode(" ")).toBe(false);
      expect(isValidCountryCode("  ")).toBe(false);
      expect(isValidCountryCode("\t")).toBe(false);
      expect(isValidCountryCode("\n")).toBe(false);
    });

    it("should not accept country codes with extra characters", () => {
      expect(isValidCountryCode("NL ")).toBe(false);
      expect(isValidCountryCode(" NL")).toBe(false);
      expect(isValidCountryCode("NLA")).toBe(false);
    });

    it("should validate all codes from SUPPORTED_COUNTRIES", () => {
      SUPPORTED_COUNTRIES.forEach((country) => {
        expect(isValidCountryCode(country.code)).toBe(true);
      });
    });
  });

  describe("CountryCode type", () => {
    it("should accept valid country codes at compile time", () => {
      // This test verifies TypeScript type checking at compile time
      const validCodes: CountryCode[] = ["NL", "BE", "DE", "LU", "FR", "GB"];
      expect(validCodes.length).toBe(6);
    });
  });
});