import type { TimeOffEntry } from "@/lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";

const DATE_FORMAT = "YYYY-MM-DD";

/**
 * Expand canonical time-off entries into the individual dates highlighted by the Gantt chart.
 * The chart only needs the requested year because its public-holiday overlay follows the same
 * year-scoped behavior.
 */
export function getGanttTimeOffDates(entries: TimeOffEntry[], year: number): string[] {
  const yearStart = dayjs(`${year}-01-01`).startOf("day");
  const yearEnd = dayjs(`${year}-12-31`).startOf("day");
  const dates = new Set<string>();

  const addDate = (date: ReturnType<typeof dayjs>) => {
    if (date.isValid() && !date.isBefore(yearStart, "day") && !date.isAfter(yearEnd, "day")) {
      dates.add(date.format(DATE_FORMAT));
    }
  };

  for (const entry of entries) {
    if (isTimeOffDateEntry(entry)) {
      addDate(dayjs(entry.date));
      continue;
    }

    if (isTimeOffRangeEntry(entry)) {
      const start = dayjs(entry.start).startOf("day");
      const end = dayjs(entry.end).startOf("day");
      if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) {
        continue;
      }

      let current = start.isBefore(yearStart, "day") ? yearStart : start;
      const last = end.isAfter(yearEnd, "day") ? yearEnd : end;
      while (!current.isAfter(last, "day")) {
        addDate(current);
        current = current.add(1, "day");
      }
      continue;
    }

    if (isTimeOffWeeklyEntry(entry)) {
      if (entry.weekday < 1 || entry.weekday > 7) {
        continue;
      }

      let current = yearStart;
      while (current.isoWeekday() !== entry.weekday) {
        current = current.add(1, "day");
      }
      while (!current.isAfter(yearEnd, "day")) {
        addDate(current);
        current = current.add(1, "week");
      }
    }
  }

  return [...dates].sort();
}
