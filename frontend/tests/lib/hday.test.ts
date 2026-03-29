import { describe, expect, it } from "vitest";
import {
  buildPreviewLine,
  EVENT_COLORS,
  type EventFlag,
  getEventClass,
  getEventColor,
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
  type HdayEvent,
  normalizeEventFlags,
  parseHday,
  sortEvents,
  toLine,
} from "../../src/lib/hday";

describe("getEventColor", () => {
  describe("default vacation/holiday colors", () => {
    it("returns HOLIDAY_FULL for no flags", () => {
      expect(getEventColor()).toBe(EVENT_COLORS.HOLIDAY_FULL);
    });

    it("returns HOLIDAY_FULL for empty array", () => {
      expect(getEventColor([])).toBe(EVENT_COLORS.HOLIDAY_FULL);
    });

    it("returns HOLIDAY_FULL for holiday flag without half-day", () => {
      expect(getEventColor(["holiday"])).toBe(EVENT_COLORS.HOLIDAY_FULL);
    });

    it("returns HOLIDAY_HALF for holiday with half_am", () => {
      expect(getEventColor(["holiday", "half_am"])).toBe(EVENT_COLORS.HOLIDAY_HALF);
    });

    it("returns HOLIDAY_HALF for holiday with half_pm", () => {
      expect(getEventColor(["holiday", "half_pm"])).toBe(EVENT_COLORS.HOLIDAY_HALF);
    });

    it("returns HOLIDAY_HALF for half_am without type flag", () => {
      expect(getEventColor(["half_am"])).toBe(EVENT_COLORS.HOLIDAY_HALF);
    });

    it("returns HOLIDAY_HALF for half_pm without type flag", () => {
      expect(getEventColor(["half_pm"])).toBe(EVENT_COLORS.HOLIDAY_HALF);
    });
  });

  describe("business event colors", () => {
    it("returns BUSINESS_FULL for business flag", () => {
      expect(getEventColor(["business"])).toBe(EVENT_COLORS.BUSINESS_FULL);
    });

    it("returns BUSINESS_HALF for business with half_am", () => {
      expect(getEventColor(["business", "half_am"])).toBe(EVENT_COLORS.BUSINESS_HALF);
    });

    it("returns BUSINESS_HALF for business with half_pm", () => {
      expect(getEventColor(["business", "half_pm"])).toBe(EVENT_COLORS.BUSINESS_HALF);
    });

    it("returns BUSINESS_HALF for business with multiple time flags (keeps only first)", () => {
      // Mutual exclusivity: only half_am is kept
      const normalized = normalizeEventFlags(["business", "half_am", "half_pm"]);
      expect(getEventColor(normalized)).toBe(EVENT_COLORS.BUSINESS_HALF);
    });
  });

  describe("course event colors", () => {
    it("returns COURSE_FULL for course flag", () => {
      expect(getEventColor(["course"])).toBe(EVENT_COLORS.COURSE_FULL);
    });

    it("returns COURSE_HALF for course with half_am", () => {
      expect(getEventColor(["course", "half_am"])).toBe(EVENT_COLORS.COURSE_HALF);
    });

    it("returns COURSE_HALF for course with half_pm", () => {
      expect(getEventColor(["course", "half_pm"])).toBe(EVENT_COLORS.COURSE_HALF);
    });
  });

  describe("in-office event colors", () => {
    it("returns IN_OFFICE_FULL for in flag", () => {
      expect(getEventColor(["in"])).toBe(EVENT_COLORS.IN_OFFICE_FULL);
    });

    it("returns IN_OFFICE_HALF for in with half_am", () => {
      expect(getEventColor(["in", "half_am"])).toBe(EVENT_COLORS.IN_OFFICE_HALF);
    });

    it("returns IN_OFFICE_HALF for in with half_pm", () => {
      expect(getEventColor(["in", "half_pm"])).toBe(EVENT_COLORS.IN_OFFICE_HALF);
    });
  });

  describe("weekend event colors", () => {
    it("returns WEEKEND_FULL for weekend flag", () => {
      expect(getEventColor(["weekend"])).toBe(EVENT_COLORS.WEEKEND_FULL);
    });

    it("returns WEEKEND_HALF for weekend with half_am", () => {
      expect(getEventColor(["weekend", "half_am"])).toBe(EVENT_COLORS.WEEKEND_HALF);
    });

    it("returns WEEKEND_HALF for weekend with half_pm", () => {
      expect(getEventColor(["weekend", "half_pm"])).toBe(EVENT_COLORS.WEEKEND_HALF);
    });
  });

  describe("birthday event colors", () => {
    it("returns BIRTHDAY_FULL for birthday flag", () => {
      expect(getEventColor(["birthday"])).toBe(EVENT_COLORS.BIRTHDAY_FULL);
    });

    it("returns BIRTHDAY_HALF for birthday with half_am", () => {
      expect(getEventColor(["birthday", "half_am"])).toBe(EVENT_COLORS.BIRTHDAY_HALF);
    });

    it("returns BIRTHDAY_HALF for birthday with half_pm", () => {
      expect(getEventColor(["birthday", "half_pm"])).toBe(EVENT_COLORS.BIRTHDAY_HALF);
    });
  });

  describe("ill event colors", () => {
    it("returns ILL_FULL for ill flag", () => {
      expect(getEventColor(["ill"])).toBe(EVENT_COLORS.ILL_FULL);
    });

    it("returns ILL_HALF for ill with half_am", () => {
      expect(getEventColor(["ill", "half_am"])).toBe(EVENT_COLORS.ILL_HALF);
    });

    it("returns ILL_HALF for ill with half_pm", () => {
      expect(getEventColor(["ill", "half_pm"])).toBe(EVENT_COLORS.ILL_HALF);
    });
  });

  describe("other event colors", () => {
    it("returns OTHER_FULL for other flag", () => {
      expect(getEventColor(["other"])).toBe(EVENT_COLORS.OTHER_FULL);
    });

    it("returns OTHER_HALF for other with half_am", () => {
      expect(getEventColor(["other", "half_am"])).toBe(EVENT_COLORS.OTHER_HALF);
    });

    it("returns OTHER_HALF for other with half_pm", () => {
      expect(getEventColor(["other", "half_pm"])).toBe(EVENT_COLORS.OTHER_HALF);
    });
  });

  describe("priority handling with multiple type flags", () => {
    it("prioritizes business over all other types", () => {
      expect(getEventColor(["business", "weekend"])).toBe(EVENT_COLORS.BUSINESS_FULL);
      expect(getEventColor(["business", "birthday"])).toBe(EVENT_COLORS.BUSINESS_FULL);
      expect(getEventColor(["business", "ill"])).toBe(EVENT_COLORS.BUSINESS_FULL);
      expect(getEventColor(["business", "course"])).toBe(EVENT_COLORS.BUSINESS_FULL);
      expect(getEventColor(["business", "in"])).toBe(EVENT_COLORS.BUSINESS_FULL);
      expect(getEventColor(["business", "other"])).toBe(EVENT_COLORS.BUSINESS_FULL);
      expect(getEventColor(["business", "holiday"])).toBe(EVENT_COLORS.BUSINESS_FULL);
    });

    it("prioritizes weekend over birthday, ill, course, in, other, holiday", () => {
      expect(getEventColor(["weekend", "birthday"])).toBe(EVENT_COLORS.WEEKEND_FULL);
      expect(getEventColor(["weekend", "ill"])).toBe(EVENT_COLORS.WEEKEND_FULL);
      expect(getEventColor(["weekend", "course"])).toBe(EVENT_COLORS.WEEKEND_FULL);
      expect(getEventColor(["weekend", "in"])).toBe(EVENT_COLORS.WEEKEND_FULL);
      expect(getEventColor(["weekend", "other"])).toBe(EVENT_COLORS.WEEKEND_FULL);
      expect(getEventColor(["weekend", "holiday"])).toBe(EVENT_COLORS.WEEKEND_FULL);
    });

    it("prioritizes birthday over ill, course, in, other, holiday", () => {
      expect(getEventColor(["birthday", "ill"])).toBe(EVENT_COLORS.BIRTHDAY_FULL);
      expect(getEventColor(["birthday", "course"])).toBe(EVENT_COLORS.BIRTHDAY_FULL);
      expect(getEventColor(["birthday", "in"])).toBe(EVENT_COLORS.BIRTHDAY_FULL);
      expect(getEventColor(["birthday", "other"])).toBe(EVENT_COLORS.BIRTHDAY_FULL);
      expect(getEventColor(["birthday", "holiday"])).toBe(EVENT_COLORS.BIRTHDAY_FULL);
    });

    it("prioritizes ill over course, in, other, holiday", () => {
      expect(getEventColor(["ill", "course"])).toBe(EVENT_COLORS.ILL_FULL);
      expect(getEventColor(["ill", "in"])).toBe(EVENT_COLORS.ILL_FULL);
      expect(getEventColor(["ill", "other"])).toBe(EVENT_COLORS.ILL_FULL);
      expect(getEventColor(["ill", "holiday"])).toBe(EVENT_COLORS.ILL_FULL);
    });

    it("prioritizes course over in, other, holiday", () => {
      expect(getEventColor(["course", "in"])).toBe(EVENT_COLORS.COURSE_FULL);
      expect(getEventColor(["course", "other"])).toBe(EVENT_COLORS.COURSE_FULL);
      expect(getEventColor(["course", "holiday"])).toBe(EVENT_COLORS.COURSE_FULL);
    });

    it("prioritizes in over other, holiday", () => {
      expect(getEventColor(["in", "other"])).toBe(EVENT_COLORS.IN_OFFICE_FULL);
      expect(getEventColor(["in", "holiday"])).toBe(EVENT_COLORS.IN_OFFICE_FULL);
    });

    it("prioritizes other over holiday", () => {
      expect(getEventColor(["other", "holiday"])).toBe(EVENT_COLORS.OTHER_FULL);
    });

    it("maintains priority with half-day flags", () => {
      expect(getEventColor(["business", "weekend", "half_am"])).toBe(EVENT_COLORS.BUSINESS_HALF);
      expect(getEventColor(["weekend", "birthday", "half_pm"])).toBe(EVENT_COLORS.WEEKEND_HALF);
      expect(getEventColor(["birthday", "ill", "half_am"])).toBe(EVENT_COLORS.BIRTHDAY_HALF);
      expect(getEventColor(["ill", "course", "half_pm"])).toBe(EVENT_COLORS.ILL_HALF);
      expect(getEventColor(["course", "in", "half_am"])).toBe(EVENT_COLORS.COURSE_HALF);
      expect(getEventColor(["in", "other", "half_pm"])).toBe(EVENT_COLORS.IN_OFFICE_HALF);
      expect(getEventColor(["other", "holiday", "half_am"])).toBe(EVENT_COLORS.OTHER_HALF);
    });
  });

  describe("color accessibility", () => {
    it("returns dark yellow/gold (#D9AD00) for course, not bright yellow", () => {
      expect(getEventColor(["course"])).toBe("#D9AD00");
      expect(getEventColor(["course"])).not.toBe("#FFFF00");
    });

    it("returns teal (#008899) for in-office, not cyan", () => {
      expect(getEventColor(["in"])).toBe("#008899");
      expect(getEventColor(["in"])).not.toBe("#00FFFF");
    });
  });
});

describe("getEventTypeLabel", () => {
  it("returns Holiday for empty flags", () => {
    expect(getEventTypeLabel([])).toBe("Holiday");
  });

  it("returns Business trip for business flag", () => {
    expect(getEventTypeLabel(["business"])).toBe("Business trip");
  });

  it("returns Sick leave for ill flag", () => {
    expect(getEventTypeLabel(["ill"])).toBe("Sick leave");
  });

  it("returns In office for in flag", () => {
    expect(getEventTypeLabel(["in"])).toBe("In office");
  });
});

describe("buildPreviewLine", () => {
  it("returns empty string when required fields are missing", () => {
    expect(
      buildPreviewLine({
        eventType: "range",
        start: "",
        end: "",
        weekday: 1,
        title: "",
        flags: [],
      }),
    ).toBe("");
  });

  it("builds a range line with normalized flags", () => {
    expect(
      buildPreviewLine({
        eventType: "range",
        start: "2025/01/02",
        end: "",
        weekday: 1,
        title: "Trip",
        flags: ["business"],
      }),
    ).toBe("b2025/01/02-2025/01/02 # Trip");
  });

  it("builds a weekly line with flags", () => {
    expect(
      buildPreviewLine({
        eventType: "weekly",
        start: "",
        end: "",
        weekday: 3,
        title: "Afternoon off",
        flags: ["half_pm"],
      }),
    ).toBe("d3p # Afternoon off");
  });
});

describe("getTimeLocationSymbol", () => {
  it("returns empty string for undefined flags", () => {
    expect(getTimeLocationSymbol()).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(getTimeLocationSymbol([])).toBe("");
  });

  it("returns left half-circle (◐) for half_am flag", () => {
    expect(getTimeLocationSymbol(["half_am"])).toBe("◐");
  });

  it("returns right half-circle (◑) for half_pm flag", () => {
    expect(getTimeLocationSymbol(["half_pm"])).toBe("◑");
  });

  it("returns ◐ when half_am is combined with other flags", () => {
    expect(getTimeLocationSymbol(["business", "half_am"])).toBe("◐");
  });

  it("returns ◑ when half_pm is combined with other flags", () => {
    expect(getTimeLocationSymbol(["course", "half_pm"])).toBe("◑");
  });

  it("returns empty string for full day events", () => {
    expect(getTimeLocationSymbol(["business"])).toBe("");
    expect(getTimeLocationSymbol(["course"])).toBe("");
    expect(getTimeLocationSymbol(["in"])).toBe("");
    expect(getTimeLocationSymbol(["holiday"])).toBe("");
  });

  it("returns first time/location flag when multiple are present (mutual exclusivity)", () => {
    // When multiple time/location flags are present, normalizeEventFlags keeps only the first one
    const normalized = normalizeEventFlags(["half_am", "half_pm"]);
    expect(getTimeLocationSymbol(normalized)).toBe("◐"); // Only half_am is kept
  });

  it("returns W for onsite flag", () => {
    expect(getTimeLocationSymbol(["onsite"])).toBe("W");
  });

  it("returns N for no_fly flag", () => {
    expect(getTimeLocationSymbol(["no_fly"])).toBe("N");
  });

  it("returns F for can_fly flag", () => {
    expect(getTimeLocationSymbol(["can_fly"])).toBe("F");
  });

  it("uses Unicode symbols that are more intuitive than comma/apostrophe", () => {
    // Verify we're not using the old symbols
    expect(getTimeLocationSymbol(["half_am"])).not.toBe(",");
    expect(getTimeLocationSymbol(["half_pm"])).not.toBe("'");
    // Verify Unicode codepoints
    expect(getTimeLocationSymbol(["half_am"]).charCodeAt(0)).toBe(0x25d0); // ◐
    expect(getTimeLocationSymbol(["half_pm"]).charCodeAt(0)).toBe(0x25d1); // ◑
  });
});

describe("normalizeEventFlags", () => {
  it("adds holiday flag when no type flags present", () => {
    const result = normalizeEventFlags([]);
    expect(result).toContain("holiday");
  });

  it("adds holiday flag to half-day flags", () => {
    const result = normalizeEventFlags(["half_am"]);
    expect(result).toContain("holiday");
    expect(result).toContain("half_am");
  });

  it("does not add holiday when business flag present", () => {
    const result = normalizeEventFlags(["business"]);
    expect(result).not.toContain("holiday");
    expect(result).toContain("business");
  });

  it("does not add holiday when course flag present", () => {
    const result = normalizeEventFlags(["course"]);
    expect(result).not.toContain("holiday");
  });

  it("does not add holiday when in flag present", () => {
    const result = normalizeEventFlags(["in"]);
    expect(result).not.toContain("holiday");
  });

  it("enforces mutual exclusivity of time/location flags when adding holiday", () => {
    const result = normalizeEventFlags(["half_am", "half_pm"]);
    // Only the first time/location flag is kept (half_am), then holiday is added
    expect(result).toEqual(["half_am", "holiday"]);
  });

  it("preserves existing flags when not adding holiday", () => {
    const result = normalizeEventFlags(["business", "half_am"]);
    expect(result).toEqual(["business", "half_am"]);
  });
});

describe("EVENT_COLORS constants", () => {
  it("defines all required color constants (WCAG AA compliant palette)", () => {
    expect(EVENT_COLORS.HOLIDAY_FULL).toBe("#EC0000");
    expect(EVENT_COLORS.HOLIDAY_HALF).toBe("#FF8A8A");
    expect(EVENT_COLORS.BUSINESS_FULL).toBe("#FF9500");
    expect(EVENT_COLORS.BUSINESS_HALF).toBe("#FFC04D");
    expect(EVENT_COLORS.COURSE_FULL).toBe("#D9AD00");
    expect(EVENT_COLORS.COURSE_HALF).toBe("#F0D04D");
    expect(EVENT_COLORS.IN_OFFICE_FULL).toBe("#008899");
    expect(EVENT_COLORS.IN_OFFICE_HALF).toBe("#00B8CC");
  });

  it("has valid hex color format for all colors", () => {
    const hexPattern = /^#[0-9A-F]{6}$/i;
    Object.values(EVENT_COLORS).forEach((color) => {
      expect(color).toMatch(hexPattern);
    });
  });
});

describe("sortEvents", () => {
  it("sorts range events by start date (oldest first)", () => {
    const events: HdayEvent[] = [
      {
        type: "range",
        start: "2025/03/15",
        end: "2025/03/20",
        flags: ["holiday"],
        title: "March vacation",
      },
      {
        type: "range",
        start: "2025/01/10",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "January vacation",
      },
      {
        type: "range",
        start: "2025/02/20",
        end: "2025/02/25",
        flags: ["holiday"],
        title: "February vacation",
      },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].start).toBe("2025/01/10");
    expect(sorted[1].start).toBe("2025/02/20");
    expect(sorted[2].start).toBe("2025/03/15");
  });

  it("places range events before weekly events", () => {
    const events: HdayEvent[] = [
      { type: "weekly", weekday: 1, flags: ["in"], title: "Monday in office" },
      {
        type: "range",
        start: "2025/12/25",
        end: "2025/12/25",
        flags: ["holiday"],
        title: "Christmas",
      },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].type).toBe("range");
    expect(sorted[1].type).toBe("weekly");
  });

  it("sorts weekly events by weekday (ISO: Monday=1 to Sunday=7)", () => {
    const events: HdayEvent[] = [
      { type: "weekly", weekday: 5, flags: ["in"], title: "Friday" },
      { type: "weekly", weekday: 1, flags: ["in"], title: "Monday" },
      { type: "weekly", weekday: 3, flags: ["in"], title: "Wednesday" },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].weekday).toBe(1); // Monday
    expect(sorted[1].weekday).toBe(3); // Wednesday
    expect(sorted[2].weekday).toBe(5); // Friday
  });

  it("places weekly events before unknown events", () => {
    const events: HdayEvent[] = [
      { type: "unknown", raw: "invalid line", flags: ["holiday"] },
      { type: "weekly", weekday: 1, flags: ["in"], title: "Monday" },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].type).toBe("weekly");
    expect(sorted[1].type).toBe("unknown");
  });

  it("places range events before unknown events", () => {
    const events: HdayEvent[] = [
      { type: "unknown", raw: "invalid line", flags: ["holiday"] },
      {
        type: "range",
        start: "2025/12/25",
        end: "2025/12/25",
        flags: ["holiday"],
        title: "Christmas",
      },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].type).toBe("range");
    expect(sorted[1].type).toBe("unknown");
  });

  it("sorts mixed event types correctly", () => {
    const events: HdayEvent[] = [
      { type: "unknown", raw: "line1", flags: ["holiday"] },
      { type: "weekly", weekday: 2, flags: ["in"], title: "Tuesday" },
      {
        type: "range",
        start: "2025/06/01",
        end: "2025/06/05",
        flags: ["holiday"],
        title: "June",
      },
      {
        type: "range",
        start: "2025/01/01",
        end: "2025/01/01",
        flags: ["holiday"],
        title: "New Year",
      },
      { type: "weekly", weekday: 1, flags: ["in"], title: "Monday" },
      { type: "unknown", raw: "line2", flags: ["holiday"] },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].type).toBe("range");
    expect(sorted[0].start).toBe("2025/01/01");
    expect(sorted[1].type).toBe("range");
    expect(sorted[1].start).toBe("2025/06/01");
    expect(sorted[2].type).toBe("weekly");
    expect(sorted[2].weekday).toBe(1);
    expect(sorted[3].type).toBe("weekly");
    expect(sorted[3].weekday).toBe(2);
    expect(sorted[4].type).toBe("unknown");
    expect(sorted[5].type).toBe("unknown");
  });

  it("does not mutate the original array", () => {
    const events: HdayEvent[] = [
      {
        type: "range",
        start: "2025/03/15",
        end: "2025/03/20",
        flags: ["holiday"],
        title: "March",
      },
      {
        type: "range",
        start: "2025/01/10",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "January",
      },
    ];

    const original = [...events];
    const sorted = sortEvents(events);

    // Original array should be unchanged
    expect(events).toEqual(original);
    expect(events[0].start).toBe("2025/03/15");

    // Sorted array should be different
    expect(sorted[0].start).toBe("2025/01/10");
  });

  it("handles empty array", () => {
    const sorted = sortEvents([]);
    expect(sorted).toEqual([]);
  });

  it("handles single event", () => {
    const events: HdayEvent[] = [
      {
        type: "range",
        start: "2025/12/25",
        end: "2025/12/25",
        flags: ["holiday"],
        title: "Christmas",
      },
    ];

    const sorted = sortEvents(events);

    expect(sorted).toEqual(events);
  });

  it("sorts events with missing start dates to the end of range events", () => {
    const events: HdayEvent[] = [
      {
        type: "range",
        start: undefined,
        end: "2025/12/25",
        flags: ["holiday"],
        title: "No start",
      } as HdayEvent,
      {
        type: "range",
        start: "2025/01/10",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "January",
      },
      {
        type: "range",
        start: "2025/03/15",
        end: "2025/03/20",
        flags: ["holiday"],
        title: "March",
      },
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].title).toBe("January");
    expect(sorted[1].title).toBe("March");
    expect(sorted[2].title).toBe("No start");
  });

  it("handles multiple events with missing start dates", () => {
    const events: HdayEvent[] = [
      {
        type: "range",
        start: undefined,
        end: "2025/12/25",
        flags: ["holiday"],
        title: "No start A",
      } as HdayEvent,
      {
        type: "range",
        start: "2025/01/10",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "January",
      },
      {
        type: "range",
        start: undefined,
        end: "2025/12/30",
        flags: ["holiday"],
        title: "No start B",
      } as HdayEvent,
    ];

    const sorted = sortEvents(events);

    expect(sorted[0].title).toBe("January");
    // Events without start dates maintain their relative order (stable sort)
    expect(sorted[1].title).toBe("No start A");
    expect(sorted[2].title).toBe("No start B");
  });
});

describe("parseHday", () => {
  describe("range events", () => {
    it("parses single-day range event", () => {
      const result = parseHday("2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["holiday"],
          title: "",
          raw: "2024/12/25",
        },
      ]);
    });

    it("parses multi-day range event", () => {
      const result = parseHday("2024/12/25-2024/12/31");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/31",
          flags: ["holiday"],
          title: "",
          raw: "2024/12/25-2024/12/31",
        },
      ]);
    });

    it("parses range event with title", () => {
      const result = parseHday("2024/12/25 # Christmas");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["holiday"],
          title: "Christmas",
          raw: "2024/12/25 # Christmas",
        },
      ]);
    });

    it("parses range event with business flag", () => {
      const result = parseHday("b2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["business"],
          title: "",
          raw: "b2024/12/25",
        },
      ]);
    });

    it("parses range event with course flag", () => {
      const result = parseHday("s2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["course"],
          title: "",
          raw: "s2024/12/25",
        },
      ]);
    });

    it("parses range event with in-office flag", () => {
      const result = parseHday("k2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["in"],
          title: "",
          raw: "k2024/12/25",
        },
      ]);
    });

    it("parses range event with ill flag", () => {
      const result = parseHday("i2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["ill"],
          title: "",
          raw: "i2024/12/25",
        },
      ]);
    });

    it("parses range event with half_am flag", () => {
      const result = parseHday("a2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["half_am", "holiday"],
          title: "",
          raw: "a2024/12/25",
        },
      ]);
    });

    it("parses range event with half_pm flag", () => {
      const result = parseHday("p2024/12/25");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["half_pm", "holiday"],
          title: "",
          raw: "p2024/12/25",
        },
      ]);
    });

    it("parses range event with multiple flags", () => {
      const result = parseHday("ba2024/12/25 # Business trip AM");
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["business", "half_am"],
          title: "Business trip AM",
          raw: "ba2024/12/25 # Business trip AM",
        },
      ]);
    });

    it("parses range event with multiple time/location flags (keeps only first)", () => {
      const result = parseHday("ap2024/12/25");
      // Mutual exclusivity: only half_am (first time/location flag) is kept
      expect(result).toEqual([
        {
          type: "range",
          start: "2024/12/25",
          end: "2024/12/25",
          flags: ["half_am", "holiday"],
          title: "",
          raw: "ap2024/12/25",
        },
      ]);
    });

    it("parses legacy holidaytool ranges with non-padded dates and r-title separator", () => {
      const result = parseHday("2026/1/23-2026/2/6 r Costa Rica - Holiday");
      expect(result).toEqual([
        {
          type: "range",
          start: "2026/01/23",
          end: "2026/02/06",
          flags: ["holiday"],
          title: "Costa Rica - Holiday",
          raw: "2026/1/23-2026/2/6 r Costa Rica - Holiday",
        },
      ]);
    });

    it("parses legacy holidaytool single-day ranges with non-padded dates", () => {
      const result = parseHday("2026/2/16 r Carnaval - Holiday");
      expect(result).toEqual([
        {
          type: "range",
          start: "2026/02/16",
          end: "2026/02/16",
          flags: ["holiday"],
          title: "Carnaval - Holiday",
          raw: "2026/2/16 r Carnaval - Holiday",
        },
      ]);
    });

    it("parses replacement marker and keeps # comment as title", () => {
      const result = parseHday("2026/07/27 rFIAT # birthday mom");
      expect(result).toEqual([
        {
          type: "range",
          start: "2026/07/27",
          end: "2026/07/27",
          flags: ["holiday"],
          title: "birthday mom",
          raw: "2026/07/27 rFIAT # birthday mom",
        },
      ]);
    });

    it("preserves original raw line whitespace while parsing trimmed content", () => {
      const result = parseHday("  2026/07/27 rFIAT # birthday mom  ");
      expect(result).toEqual([
        {
          type: "range",
          start: "2026/07/27",
          end: "2026/07/27",
          flags: ["holiday"],
          title: "birthday mom",
          raw: "  2026/07/27 rFIAT # birthday mom  ",
        },
      ]);
    });

    it("treats non-r single-letter separators as unknown format", () => {
      const result = parseHday("2026/2/16 x Should not parse");
      expect(result).toEqual([
        {
          type: "unknown",
          raw: "2026/2/16 x Should not parse",
          flags: ["holiday"],
        },
      ]);
    });
  });

  describe("weekly events", () => {
    it("parses weekly event for Monday", () => {
      const result = parseHday("d1");
      expect(result).toEqual([
        {
          type: "weekly",
          weekday: 1,
          flags: ["holiday"],
          title: "",
          raw: "d1",
        },
      ]);
    });

    it("parses weekly event with title", () => {
      const result = parseHday("d1 # Team meeting");
      expect(result).toEqual([
        {
          type: "weekly",
          weekday: 1,
          flags: ["holiday"],
          title: "Team meeting",
          raw: "d1 # Team meeting",
        },
      ]);
    });

    it("parses weekly event with in-office flag", () => {
      const result = parseHday("d1k # Office day");
      expect(result).toEqual([
        {
          type: "weekly",
          weekday: 1,
          flags: ["in"],
          title: "Office day",
          raw: "d1k # Office day",
        },
      ]);
    });

    it("parses weekly event with half-day flag", () => {
      const result = parseHday("d2ka");
      expect(result).toEqual([
        {
          type: "weekly",
          weekday: 2,
          flags: ["in", "half_am"],
          title: "",
          raw: "d2ka",
        },
      ]);
    });

    it("parses all ISO weekdays (1-7)", () => {
      const days = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];
      for (let i = 0; i < days.length; i++) {
        const result = parseHday(days[i] as string);
        expect(result[0]?.weekday).toBe(i + 1); // ISO weekday: 1=Mon, 7=Sun
      }
    });
  });

  describe("unknown events", () => {
    it("handles unknown format", () => {
      const result = parseHday("random text");
      expect(result).toEqual([
        {
          type: "unknown",
          raw: "random text",
          flags: ["holiday"],
        },
      ]);
    });

    it("handles empty lines", () => {
      const result = parseHday("2024/12/25\n\n\n2024/12/26");
      expect(result).toHaveLength(2);
      expect(result[0]?.start).toBe("2024/12/25");
      expect(result[1]?.start).toBe("2024/12/26");
    });
  });

  describe("multi-line input", () => {
    it("parses multiple events", () => {
      const input = `2024/12/25 # Christmas
b2024/12/26-2024/12/28 # Business trip
d1k # Office day`;

      const result = parseHday(input);
      expect(result).toHaveLength(3);
      expect(result[0]?.type).toBe("range");
      expect(result[1]?.type).toBe("range");
      expect(result[2]?.type).toBe("weekly");
    });

    it("handles Windows line endings", () => {
      const input = "2024/12/25\r\n2024/12/26";
      const result = parseHday(input);
      expect(result).toHaveLength(2);
    });
  });
});

describe("toLine", () => {
  it("serializes single-day range event", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
      flags: ["holiday"],
      title: "",
    };
    expect(toLine(event)).toBe("2024/12/25-2024/12/25");
  });

  it("serializes multi-day range event", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/31",
      flags: ["holiday"],
      title: "",
    };
    expect(toLine(event)).toBe("2024/12/25-2024/12/31");
  });

  it("serializes range event with title", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
      flags: ["holiday"],
      title: "Christmas",
    };
    expect(toLine(event)).toBe("2024/12/25-2024/12/25 # Christmas");
  });

  it("serializes range event with business flag", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
      flags: ["business"],
    };
    expect(toLine(event)).toBe("b2024/12/25-2024/12/25");
  });

  it("serializes range event with half_am flag", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
      flags: ["half_am", "holiday"],
    };
    expect(toLine(event)).toBe("a2024/12/25-2024/12/25");
  });

  it("serializes range event with multiple flags", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
      flags: ["half_am", "business"],
      title: "Business AM",
    };
    expect(toLine(event)).toBe("ba2024/12/25-2024/12/25 # Business AM");
  });

  it("serializes weekly event", () => {
    const event: HdayEvent = {
      type: "weekly",
      weekday: 1,
      flags: ["in"],
      title: "Office day",
    };
    expect(toLine(event)).toBe("d1k # Office day");
  });

  it("serializes unknown event with raw field", () => {
    const event: HdayEvent = {
      type: "unknown",
      raw: "random text",
      flags: ["holiday"],
    };
    expect(toLine(event)).toBe("random text");
  });

  it("throws error for unknown event without raw field", () => {
    const event = {
      type: "unknown" as const,
      flags: ["holiday"] as EventFlag[],
    };
    expect(() => toLine(event)).toThrow(/missing 'raw' field/);
  });

  it("roundtrips parse and serialize correctly", () => {
    const input = `2024/12/25-2024/12/25 # Christmas
ba2024/12/26-2024/12/26 # Business AM
d1k # Office`;

    const events = parseHday(input);
    const serialized = events.map((e) => toLine(e)).join("\n");
    expect(serialized).toBe(input);
  });

  it("filters out holiday flag from prefix", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
      flags: ["holiday"],
      title: "Test",
    };
    expect(toLine(event)).toBe("2024/12/25-2024/12/25 # Test");
    expect(toLine(event)).not.toContain("h");
  });

  it("handles events without flags", () => {
    const event: HdayEvent = {
      type: "range",
      start: "2024/12/25",
      end: "2024/12/25",
    };
    expect(toLine(event)).toBe("2024/12/25-2024/12/25");
  });

  it("handles weekly events without title", () => {
    const event: HdayEvent = {
      type: "weekly",
      weekday: 3,
      flags: ["in"],
    };
    expect(toLine(event)).toBe("d3k");
  });
});

describe("getEventColorClass", () => {
  it("returns holiday-full for no flags (range event)", () => {
    expect(getEventColorClass(undefined, "range")).toBe("event-holiday-full");
  });

  it("returns holiday-full for default holiday flag on a range event", () => {
    expect(getEventColorClass(["holiday"], "range")).toBe("event-holiday-full");
  });

  it("returns recurring-full for a weekly event with no explicit type flag (plain d1)", () => {
    // The parser injects "holiday" as the default flag for bare dx entries.
    // Without eventType, this would incorrectly return vacation red.
    expect(getEventColorClass(["holiday"], "weekly")).toBe("event-recurring-full");
  });

  it("returns recurring-full for a weekly event with empty flags", () => {
    expect(getEventColorClass([], "weekly")).toBe("event-recurring-full");
  });

  it("respects explicit type flag on a weekly event (e.g. business trip every Monday)", () => {
    expect(getEventColorClass(["business"], "weekly")).toBe("event-business-full");
  });

  it("respects half-day flag on a weekly event", () => {
    expect(getEventColorClass(["half_am", "holiday"], "weekly")).toBe("event-recurring-half");
  });

  it("is backward compatible — omitting eventType returns vacation color for default flag", () => {
    expect(getEventColorClass(["holiday"])).toBe("event-holiday-full");
  });
});

describe("getEventClass", () => {
  it("returns holiday-full for no flags", () => {
    expect(getEventClass()).toBe("event-holiday-full");
  });

  it("returns holiday-full for empty array", () => {
    expect(getEventClass([])).toBe("event-holiday-full");
  });

  it("returns holiday-full for holiday flag", () => {
    expect(getEventClass(["holiday"])).toBe("event-holiday-full");
  });

  it("returns holiday-half for half_am", () => {
    expect(getEventClass(["half_am", "holiday"])).toBe("event-holiday-half");
  });

  it("returns holiday-half for half_pm", () => {
    expect(getEventClass(["half_pm", "holiday"])).toBe("event-holiday-half");
  });

  it("returns holiday-half for multiple time flags (keeps only first)", () => {
    // Mutual exclusivity: only half_am is kept
    const normalized = normalizeEventFlags(["half_am", "half_pm", "holiday"]);
    expect(getEventClass(normalized)).toBe("event-holiday-half");
  });

  it("returns business-full for business flag", () => {
    expect(getEventClass(["business"])).toBe("event-business-full");
  });

  it("returns business-half for business with half_am", () => {
    expect(getEventClass(["half_am", "business"])).toBe("event-business-half");
  });

  it("returns business-half for business with half_pm", () => {
    expect(getEventClass(["half_pm", "business"])).toBe("event-business-half");
  });

  it("returns course-full for course flag", () => {
    expect(getEventClass(["course"])).toBe("event-course-full");
  });

  it("returns course-half for course with half_pm", () => {
    expect(getEventClass(["half_pm", "course"])).toBe("event-course-half");
  });

  it("returns in-full for in flag", () => {
    expect(getEventClass(["in"])).toBe("event-in-full");
  });

  it("returns in-full for in with half_am", () => {
    expect(getEventClass(["half_am", "in"])).toBe("event-in-full");
  });

  it("returns weekend-full for weekend flag", () => {
    expect(getEventClass(["weekend"])).toBe("event-weekend-full");
  });

  it("returns weekend-half for weekend with half_am", () => {
    expect(getEventClass(["half_am", "weekend"])).toBe("event-weekend-half");
  });

  it("returns weekend-half for weekend with half_pm", () => {
    expect(getEventClass(["half_pm", "weekend"])).toBe("event-weekend-half");
  });

  it("returns birthday-full for birthday flag", () => {
    expect(getEventClass(["birthday"])).toBe("event-birthday-full");
  });

  it("returns birthday-half for birthday with half_am", () => {
    expect(getEventClass(["half_am", "birthday"])).toBe("event-birthday-half");
  });

  it("returns birthday-half for birthday with half_pm", () => {
    expect(getEventClass(["half_pm", "birthday"])).toBe("event-birthday-half");
  });

  it("returns ill-full for ill flag", () => {
    expect(getEventClass(["ill"])).toBe("event-ill-full");
  });

  it("returns ill-half for ill with half_am", () => {
    expect(getEventClass(["half_am", "ill"])).toBe("event-ill-half");
  });

  it("returns ill-half for ill with half_pm", () => {
    expect(getEventClass(["half_pm", "ill"])).toBe("event-ill-half");
  });

  it("returns other-full for other flag", () => {
    expect(getEventClass(["other"])).toBe("event-other-full");
  });

  it("returns other-half for other with half_am", () => {
    expect(getEventClass(["half_am", "other"])).toBe("event-other-half");
  });

  it("returns other-half for other with half_pm", () => {
    expect(getEventClass(["half_pm", "other"])).toBe("event-other-half");
  });

  it("prioritizes business over other type flags", () => {
    expect(getEventClass(["business", "course", "in"])).toBe("event-business-full");
  });

  it("prioritizes course over in", () => {
    expect(getEventClass(["course", "in"])).toBe("event-course-full");
  });

  it("returns correct class for complex flag combinations", () => {
    // Mutual exclusivity: when both half_am and half_pm present, only half_am is kept
    const normalized1 = normalizeEventFlags(["half_am", "half_pm", "business"]);
    expect(getEventClass(normalized1)).toBe("event-business-half");
    expect(getEventClass(["half_am", "course", "in"])).toBe("event-course-half");
  });
});
