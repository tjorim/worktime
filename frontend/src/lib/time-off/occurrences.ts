import { dayjs } from "@/lib/dates/dateTimeUtils";
import type { TimeOffEntry } from "@/lib/time-off/types";

export interface TimeOffOccurrence {
  entry: TimeOffEntry;
  start: string;
  end: string;
}

/** Find dated entries and expand weekly entries over an inclusive window. */
export function getTimeOffOccurrences(
  entries: readonly TimeOffEntry[],
  rangeStart: Date,
  rangeEnd: Date,
): TimeOffOccurrence[] {
  const firstDay = dayjs(rangeStart);
  const lastDay = dayjs(rangeEnd);

  return entries.flatMap((entry) => {
    if (entry.entryKind === "weekly") {
      const offset = (entry.weekday - firstDay.isoWeekday() + 7) % 7;
      const occurrences: TimeOffOccurrence[] = [];
      for (
        let current = firstDay.add(offset, "day");
        current.isSameOrBefore(lastDay, "day");
        current = current.add(7, "day")
      ) {
        const date = current.format("YYYY-MM-DD");
        occurrences.push({ entry, start: date, end: date });
      }
      return occurrences;
    }

    const start = entry.entryKind === "date" ? entry.date : entry.start;
    const end = entry.entryKind === "date" ? entry.date : entry.end;
    return dayjs(start).isSameOrBefore(lastDay, "day") && dayjs(end).isSameOrAfter(firstDay, "day")
      ? [{ entry, start, end }]
      : [];
  });
}
