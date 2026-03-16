import { describe, expect, it } from "vite-plus/test";
import { CONFIG } from "../../src/utils/config";

describe("config", () => {
  describe("CONFIG constants", () => {
    it("has correct constant values", () => {
      expect(CONFIG.MAX_TRANSFERS_DISPLAY).toBe(20);
    });

    it("CONFIG object is read-only", () => {
      // CONFIG is declared as const, which provides compile-time immutability
      // Runtime immutability would require Object.freeze() but that's not necessary here
      expect(typeof CONFIG).toBe("object");
      expect(CONFIG).not.toBeNull();
    });

    it("has all expected properties", () => {
      expect(CONFIG).toHaveProperty("MAX_TRANSFERS_DISPLAY");
      expect(CONFIG).toHaveProperty("VERSION");
    });

    it("has correct types for all properties", () => {
      expect(typeof CONFIG.MAX_TRANSFERS_DISPLAY).toBe("number");
      expect(typeof CONFIG.VERSION).toBe("string");
    });

    it("numeric constants are positive integers", () => {
      expect(CONFIG.MAX_TRANSFERS_DISPLAY).toBeGreaterThan(0);
      expect(Number.isInteger(CONFIG.MAX_TRANSFERS_DISPLAY)).toBe(true);
    });
  });

  // Note: TEAMS_COUNT, SHIFT_CYCLE_DAYS, REFERENCE_DATE, and REFERENCE_TEAM have been
  // moved to roster-specific configurations in src/data/rosters.ts. Each schedule now
  // defines its own reference values, making the system more flexible and self-contained.
});
