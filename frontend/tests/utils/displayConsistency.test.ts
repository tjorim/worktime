import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@/paraglide/runtime.js";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatHdayDate,
  formatISODate,
} from "@/utils/dateTimeUtils";
import { getEventFlagLabel } from "@/data/timeoffConstants";

afterEach(() => setLocale("en", { reload: false }));
describe("display consistency", () => {
  it.each([
    ["en", "2 Nov 2026", "Training/Course", "AM (half day)"],
    ["nl", "2 nov 2026", "Training/Cursus", "Ochtend (halve dag)"],
  ] as const)("localises dates and flags in %s", (locale, date, course, half) => {
    setLocale(locale, { reload: false });
    expect(formatDisplayDate("2026-11-02")).toBe(date);
    expect(formatDisplayDateTime("2026-11-02T22:24:00")).toBe(`${date} 22:24`);
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
