import { describe, expect, it } from "vitest";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { getGanttTimeOffDates } from "@/utils/ganttTimeOff";

describe("getGanttTimeOffDates", () => {
  it("expands date, range, and weekly entries within the requested year", () => {
    const entries: TimeOffEntry[] = [
      {
        id: "date",
        entryKind: "date",
        date: "2026-03-01",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "range",
        entryKind: "range",
        start: "2025-12-31",
        end: "2026-01-02",
        entryType: "ill",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "weekly",
        entryKind: "weekly",
        weekday: 1,
        entryType: "in",
        entryFlag: "full_day",
        note: null,
      },
    ];

    const dates = getGanttTimeOffDates(entries, 2026);

    expect(dates).toContain("2026-01-01");
    expect(dates).toContain("2026-01-02");
    expect(dates).toContain("2026-01-05");
    expect(dates).toContain("2026-12-28");
    expect(dates).toContain("2026-03-01");
    expect(dates).not.toContain("2025-12-31");
  });

  it("deduplicates dates and ignores invalid ranges", () => {
    const entries: TimeOffEntry[] = [
      {
        id: "date",
        entryKind: "date",
        date: "2026-02-01",
        entryType: "vacation",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "range",
        entryKind: "range",
        start: "2026-02-01",
        end: "2026-02-02",
        entryType: "ill",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "invalid-weekly",
        entryKind: "weekly",
        weekday: 8,
        entryType: "other",
        entryFlag: "full_day",
        note: null,
      },
      {
        id: "invalid",
        entryKind: "range",
        start: "2026-04-02",
        end: "2026-04-01",
        entryType: "other",
        entryFlag: "full_day",
        note: null,
      },
    ];

    expect(getGanttTimeOffDates(entries, 2026)).toEqual(["2026-02-01", "2026-02-02"]);
  });
});
