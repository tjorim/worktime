import { describe, expect, it } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import { getFlexEndFromStart, getFlexEndRange, getFlexWindow } from "@/utils/flexShift";

describe("flexShift utils", () => {
  describe("getFlexWindow", () => {
    it("returns the window when all flex fields are present", () => {
      expect(
        getFlexWindow({ flexStartEarliest: 7, flexStartLatest: 9, presenceHours: 8.5 }),
      ).toEqual({ earliestStart: 7, latestStart: 9, presenceHours: 8.5 });
    });

    it("returns null when the shift has no flex fields", () => {
      expect(getFlexWindow({})).toBeNull();
      expect(getFlexWindow(null)).toBeNull();
    });

    it("returns null when only some flex fields are present", () => {
      expect(getFlexWindow({ flexStartEarliest: 7, flexStartLatest: 9 })).toBeNull();
      expect(getFlexWindow({ presenceHours: 8.5 })).toBeNull();
    });

    it("treats a zero start hour as valid (not missing)", () => {
      expect(
        getFlexWindow({ flexStartEarliest: 0, flexStartLatest: 2, presenceHours: 8.5 }),
      ).toEqual({ earliestStart: 0, latestStart: 2, presenceHours: 8.5 });
    });
  });

  describe("getFlexEndFromStart", () => {
    it("adds the presence duration to the start (07:00 + 8.5h = 15:30)", () => {
      const start = dayjs("2025-06-02T07:00");
      expect(getFlexEndFromStart(start, 8.5).format("HH:mm")).toBe("15:30");
    });

    it("handles a fractional clock-in (07:04 + 8.5h = 15:34)", () => {
      const start = dayjs("2025-06-02T07:04");
      expect(getFlexEndFromStart(start, 8.5).format("HH:mm")).toBe("15:34");
    });
  });

  describe("getFlexEndRange", () => {
    it("computes the earliest and latest finish for the 7-9 / 8.5h window", () => {
      const day = dayjs("2025-06-02T12:00");
      const { earliestEnd, latestEnd } = getFlexEndRange(day, {
        earliestStart: 7,
        latestStart: 9,
        presenceHours: 8.5,
      });
      expect(earliestEnd.format("HH:mm")).toBe("15:30");
      expect(latestEnd.format("HH:mm")).toBe("17:30");
    });
  });
});
