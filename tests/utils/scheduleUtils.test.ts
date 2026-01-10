import { describe, expect, it, vi } from "vitest";
import { getEffectiveTeam, getScheduleConfig, getTeamCountForOption } from "../../src/utils/scheduleUtils";

describe("scheduleUtils", () => {
  describe("getScheduleConfig", () => {
    it("should return 5-shift config when no option is provided", () => {
      const config = getScheduleConfig(null);
      expect(config.value).toBe("5-shift");
    });

    it("should return 5-shift config when undefined is provided", () => {
      const config = getScheduleConfig(undefined);
      expect(config.value).toBe("5-shift");
    });

    it("should return the requested schedule config", () => {
      const config = getScheduleConfig("9-5");
      expect(config.value).toBe("9-5");
    });

    it("should throw an error for invalid schedule option", () => {
      expect(() => getScheduleConfig("invalid-schedule" as any)).toThrow(
        "Schedule configuration not found",
      );
    });
  });

  describe("getTeamCountForOption", () => {
    it("should return team count for 5-shift schedule", () => {
      const teamCount = getTeamCountForOption("5-shift");
      expect(teamCount).toBe(5);
    });

    it("should return team count for 9-5 schedule", () => {
      const teamCount = getTeamCountForOption("9-5");
      expect(teamCount).toBe(1);
    });

    it("should use default schedule when null is provided", () => {
      const teamCount = getTeamCountForOption(null);
      expect(teamCount).toBe(5); // 5-shift is default
    });
  });

  describe("getEffectiveTeam", () => {
    describe("single-user schedules (showsTeamSelection: false)", () => {
      it("should return 1 when myTeam is null", () => {
        const result = getEffectiveTeam(null, "9-5");
        expect(result).toBe(1);
      });

      it("should return 1 when myTeam is 1", () => {
        const result = getEffectiveTeam(1, "9-5");
        expect(result).toBe(1);
      });

      it("should return 1 even when myTeam is an invalid number", () => {
        const result = getEffectiveTeam(999, "9-5");
        expect(result).toBe(1);
      });

      it("should return 1 even when myTeam is negative", () => {
        const result = getEffectiveTeam(-1, "9-5");
        expect(result).toBe(1);
      });

      it("should return 1 even when myTeam is 0", () => {
        const result = getEffectiveTeam(0, "9-5");
        expect(result).toBe(1);
      });
    });

    describe("multi-team schedules (showsTeamSelection: true)", () => {
      it("should return null when myTeam is null", () => {
        const result = getEffectiveTeam(null, "5-shift");
        expect(result).toBe(null);
      });

      it("should return the team number when valid (1)", () => {
        const result = getEffectiveTeam(1, "5-shift");
        expect(result).toBe(1);
      });

      it("should return the team number when valid (3)", () => {
        const result = getEffectiveTeam(3, "5-shift");
        expect(result).toBe(3);
      });

      it("should return the team number when valid (5)", () => {
        const result = getEffectiveTeam(5, "5-shift");
        expect(result).toBe(5);
      });

      it("should return null for team number below valid range", () => {
        const result = getEffectiveTeam(0, "5-shift");
        expect(result).toBe(null);
      });

      it("should return null for negative team number", () => {
        const result = getEffectiveTeam(-1, "5-shift");
        expect(result).toBe(null);
      });

      it("should return null for team number above valid range", () => {
        const result = getEffectiveTeam(6, "5-shift");
        expect(result).toBe(null);
      });

      it("should return null for team number way above valid range", () => {
        const result = getEffectiveTeam(999, "5-shift");
        expect(result).toBe(null);
      });

      it("should log a warning for invalid team numbers", () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        
        getEffectiveTeam(999, "5-shift");
        
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          "Invalid team number 999 (expected 1-5). Treating as null.",
        );
        
        consoleWarnSpy.mockRestore();
      });
    });

    describe("multi-team schedules with hidden selection (showsTeamSelection: false)", () => {
      // These schedules have multiple teams but don't show team selection UI
      // Examples: "2-shift" and "weekend-shift" with teamCount: 2
      
      it("should return null when myTeam is null for 2-shift", () => {
        const result = getEffectiveTeam(null, "2-shift");
        expect(result).toBe(null);
      });

      it("should return team 1 when valid for 2-shift", () => {
        const result = getEffectiveTeam(1, "2-shift");
        expect(result).toBe(1);
      });

      it("should return team 2 when valid for 2-shift", () => {
        const result = getEffectiveTeam(2, "2-shift");
        expect(result).toBe(2);
      });

      it("should return null for team number above valid range for 2-shift", () => {
        const result = getEffectiveTeam(3, "2-shift");
        expect(result).toBe(null);
      });

      it("should return null when myTeam is null for weekend-shift", () => {
        const result = getEffectiveTeam(null, "weekend-shift");
        expect(result).toBe(null);
      });

      it("should return team 1 when valid for weekend-shift", () => {
        const result = getEffectiveTeam(1, "weekend-shift");
        expect(result).toBe(1);
      });

      it("should return team 2 when valid for weekend-shift", () => {
        const result = getEffectiveTeam(2, "weekend-shift");
        expect(result).toBe(2);
      });

      it("should return null for team number above valid range for weekend-shift", () => {
        const result = getEffectiveTeam(3, "weekend-shift");
        expect(result).toBe(null);
      });

      it("should log a warning for invalid team number in hidden selection schedule", () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        
        getEffectiveTeam(5, "2-shift");
        
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          "Invalid team number 5 (expected 1-2). Treating as null.",
        );
        
        consoleWarnSpy.mockRestore();
      });
    });

    describe("edge cases", () => {
      it("should handle null scheduleOption by using default", () => {
        const result = getEffectiveTeam(1, null);
        expect(result).toBe(1);
      });

      it("should handle undefined scheduleOption by using default", () => {
        const result = getEffectiveTeam(1, undefined);
        expect(result).toBe(1);
      });

      it("should throw error for invalid schedule option", () => {
        expect(() => getEffectiveTeam(1, "invalid-schedule" as any)).toThrow(
          "Schedule configuration not found",
        );
      });
    });
  });
});
