import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@/paraglide/runtime.js";
import {
  formatDecimalHours,
  formatDuration,
  formatLongDate,
  formatDisplayDate,
  formatDisplayDateTime,
  formatHdayDate,
  formatISODate,
} from "@/lib/dates/dateTimeUtils";
import { getEventFlagLabel } from "@/lib/time-off/timeoffConstants";

afterEach(() => setLocale("en", { reload: false }));
describe("display consistency", () => {
  it.each([
    ["en", "2 Nov 2026", "Training", "AM (half day)"],
    ["nl", "2 nov 2026", "Training", "Ochtend (halve dag)"],
  ] as const)("localises dates and flags in %s", (locale, date, course, half) => {
    setLocale(locale, { reload: false });
    expect(formatDisplayDate("2026-11-02")).toBe(date);
    expect(formatDisplayDateTime("2026-11-02T22:24:00")).toBe(`${date}, 22:24`);
    expect(getEventFlagLabel("course")).toBe(course);
    expect(getEventFlagLabel("half_am")).toBe(half);
    expect(getEventFlagLabel("ill")).not.toBe("ill");
    expect(formatDisplayDateTime("invalid")).toBe("—");
  });
  it("keeps machine-readable dates separate", () => {
    const date = new Date(2026, 10, 2);
    expect(formatISODate(date)).toBe("2026-11-02");
    expect(formatHdayDate(date)).toBe("2026/11/02");
  });
});

describe("shared date and duration display", () => {
  it.each([
    ["en", "Thursday, 12 November 2026", "12 Nov", "7h 55m", "12.50"],
    ["nl", "donderdag 12 november 2026", "12 nov", "7 u 55 m", "12,50"],
  ] as const)("uses the active %s locale", (locale, longDate, monthDay, duration, decimal) => {
    setLocale(locale, { reload: false });
    expect(formatLongDate("2026-11-12")).toBe(longDate);
    expect(formatDisplayDate("2026-11-12", "monthDay")).toBe(monthDay);
    expect(formatDuration(7 * 3600 + 55 * 60)).toBe(duration);
    expect(formatDecimalHours(12.5, 2)).toBe(decimal);
  });

  it("rounds across unit boundaries and preserves signs and timer precision", () => {
    expect(formatDuration(3599)).toBe("1h");
    expect(formatDuration(-1800)).toBe("-30m");
    expect(formatDuration(0, { style: "long" })).toBe("0 minutes");
    expect(formatDuration(90061, { style: "digital", precision: "second" })).toBe("25:01:01");
  });
});
