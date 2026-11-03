import { describe, expect, it } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import { calculateShift } from "@/utils/shiftCalculations";
import {
  calculateAdjustedWeeklyTarget,
  statisticsWorkingDays,
  type WorkingDayOptions,
} from "@/utils/statisticsWorkingDays";
import { calculateVacationStats } from "@/utils/vacationCalculations";
import { buildTimeOffEntryForRange, createWeeklyTimeOffEntry } from "@/lib/timeOff/codecs";

const options: WorkingDayOptions = { team: 1, schedule: "9-5", holidays: new Map() };
const leave = (
  start: string,
  end = start,
  entryFlag: "full_day" | "half_am" | "half_pm" = "full_day",
  entryType: "vacation" | "ill" = "vacation",
) => buildTimeOffEntryForRange({ start, end, entryFlag, entryType });

describe("schedule-based statistics", () => {
  it("counts a Monday–Sunday vacation as five days and resolves overlaps by type per half", () => {
    const entries = [
      leave("2026-11-09", "2026-11-15"),
      leave("2026-11-11", "2026-11-20", "full_day", "ill"),
    ];
    const stats = calculateVacationStats(entries, 2026, options);
    expect(stats.totalDays).toBe(10);
    expect(stats.byType.find((type) => type.key === "holiday")?.days).toBe(5);
    expect(stats.byType.find((type) => type.key === "ill")?.days).toBe(5);
    expect(calculateVacationStats([...entries].reverse(), 2026, options)).toEqual(stats);
  });
  it("unions duplicate halves but counts complementary halves", () => {
    const am = leave("2026-11-09", undefined, "half_am");
    expect(calculateVacationStats([am, am], 2026, options).totalDays).toBe(0.5);
    expect(
      calculateVacationStats([am, leave("2026-11-09", undefined, "half_pm")], 2026, options)
        .totalDays,
    ).toBe(1);
  });
  it("excludes holidays, including from recurring entries for the whole year", () => {
    const holidays = new Map([["2026/11/11", { name: "Holiday", localName: "Holiday" }]]);
    const opts = { ...options, holidays };
    expect(calculateVacationStats([leave("2026-11-09", "2026-11-15")], 2026, opts).totalDays).toBe(
      4,
    );
    const weekly = createWeeklyTimeOffEntry({
      weekday: 3,
      entryType: "vacation",
      entryFlag: "full_day",
    });
    expect(calculateVacationStats([weekly], 2026, opts).totalDays).toBe(51);
  });
  it.each(["9-5", "5-shift", "2-shift", "weekend-shift"] as const)(
    "uses the %s roster including weekend shifts",
    (schedule) => {
      const start = dayjs("2026-12-14");
      const opts = { ...options, schedule };
      const expected = Array.from({ length: 7 }, (_, i) =>
        calculateShift(start.add(i, "day"), 1, schedule),
      ).filter((shift) => shift.isWorking).length;
      expect(statisticsWorkingDays(start, start.add(6, "day"), opts)).toHaveLength(expected);
      expect(
        calculateVacationStats([leave("2026-12-14", "2026-12-20")], 2026, opts).totalDays,
      ).toBe(expected);
    },
  );
  it("uses the existing next-day holiday rule for night shifts", () => {
    const start = dayjs("2026-01-01");
    const night = Array.from({ length: 40 }, (_, i) => start.add(i, "day")).find(
      (date) => calculateShift(date, 1, "5-shift").code === "N",
    )!;
    const opts = {
      ...options,
      schedule: "5-shift" as const,
      holidays: new Map([
        [night.add(1, "day").format("YYYY/MM/DD"), { name: "Holiday", localName: "Holiday" }],
      ]),
    };
    expect(statisticsWorkingDays(night, night, opts)).toHaveLength(0);
    expect(calculateVacationStats([leave(night.format("YYYY-MM-DD"))], 2026, opts).totalDays).toBe(
      0,
    );
  });
  it("reduces targets for full leave, holidays and half days without double subtraction", () => {
    expect(calculateAdjustedWeeklyTarget("2026-11-09", options, []).weeklyHours).toBe(40);
    expect(
      calculateAdjustedWeeklyTarget("2026-11-09", options, [leave("2026-11-09", "2026-11-15")])
        .weeklyHours,
    ).toBe(0);
    const opts = {
      ...options,
      holidays: new Map([["2026/11/11", { name: "Holiday", localName: "Holiday" }]]),
    };
    expect(calculateAdjustedWeeklyTarget("2026-11-09", opts, []).workingDays).toBe(5);
    const half = leave("2026-11-12", undefined, "half_am");
    expect(
      calculateAdjustedWeeklyTarget("2026-11-09", opts, [half, half, leave("2026-11-11")])
        .weeklyHours,
    ).toBe(28);
  });
});
